import os
import json
import time
from flask import Flask, request, jsonify, render_template
import google.generativeai as genai
from dotenv import load_dotenv
import PyPDF2
import docx2txt
from werkzeug.utils import secure_filename

load_dotenv()

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['MAX_CONTENT_LENGTH'] = 5 * 1024 * 1024  # 5MB max
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

# ── Gemini setup ──────────────────────────────────────────────────────────────
api_key = os.getenv("GEMINI_API_KEY")
if api_key and api_key != "your_api_key_here":
    genai.configure(api_key=api_key)

ALLOWED_EXTENSIONS = {'pdf', 'docx', 'txt'}


def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


# ── Text extraction (reused across all endpoints) ─────────────────────────────
def extract_text(filepath):
    """Extract plain text from PDF, DOCX, or TXT file."""
    ext = filepath.rsplit('.', 1)[1].lower()
    text = ""
    if ext == 'pdf':
        with open(filepath, 'rb') as f:
            reader = PyPDF2.PdfReader(f)
            for page in reader.pages:
                text += page.extract_text() or ""
    elif ext == 'docx':
        text = docx2txt.process(filepath)
    elif ext == 'txt':
        with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
            text = f.read()
    return text.strip()


# ── LLM call helper with retry on rate limit ──────────────────────────────────
def call_gemini(prompt, max_retries=3):
    """Call Gemini and return response text. Retries on 429."""
    model = genai.GenerativeModel('gemini-3.6-flash')
    for attempt in range(max_retries):
        try:
            response = model.generate_content(prompt)
            return response.text.strip()
        except Exception as e:
            if '429' in str(e) and attempt < max_retries - 1:
                print(f"Rate limit hit. Waiting 40s before retry {attempt + 2}/{max_retries}...")
                time.sleep(40)
            else:
                raise


def parse_json_response(raw):
    """Strip markdown fences from LLM output and parse JSON."""
    text = raw.strip()
    if text.startswith("```json"):
        text = text[7:]
    if text.startswith("```"):
        text = text[3:]
    if text.endswith("```"):
        text = text[:-3]
    return json.loads(text.strip())


def save_upload(file):
    """Save an uploaded file to the uploads folder and return its path."""
    filename = secure_filename(file.filename)
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    file.save(filepath)
    return filepath


# ── Routes ────────────────────────────────────────────────────────────────────
@app.route('/')
def index():
    return render_template('index.html')


@app.route('/privacy')
def privacy():
    return render_template('privacy.html')


@app.route('/terms')
def terms():
    return render_template('terms.html')


# ── POST /analyze — ATS score only (existing feature, unchanged) ──────────────
@app.route('/analyze', methods=['POST'])
def analyze_resume():
    if not api_key or api_key == "your_api_key_here":
        return jsonify({"error": "Gemini API key is not configured."}), 500

    if 'file' not in request.files:
        return jsonify({"error": "No file provided."}), 400

    file = request.files['file']
    if not file.filename:
        return jsonify({"error": "No file selected."}), 400
    if not allowed_file(file.filename):
        return jsonify({"error": "Invalid format. Only PDF and DOCX are supported."}), 400

    try:
        filepath = save_upload(file)
        resume_text = extract_text(filepath)
        os.remove(filepath)

        if not resume_text:
            return jsonify({"error": "Could not extract text from the file."}), 400

        prompt = f"""
You are an expert ATS (Applicant Tracking System) analyzer.
Review the resume below and return a raw JSON object (no markdown fences).

JSON schema:
{{
    "score": <integer 0-100>,
    "missing_sections": [<list of strings>],
    "spelling_mistakes": [<list of strings>],
    "improvement_suggestions": [<list of strings>]
}}

Resume:
{resume_text}
"""
        raw = call_gemini(prompt)
        result = parse_json_response(raw)
        return jsonify(result)

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ── POST /analyze-jd — ATS score + JD gap analysis ───────────────────────────
@app.route('/analyze-jd', methods=['POST'])
def analyze_jd():
    """
    Accepts:
      - resume: file (PDF/DOCX)
      - jd_file: file (PDF/DOCX/TXT) — optional
      - jd_text: string — optional (used if jd_file not provided)

    Returns JSON matching the schema below.
    """
    if not api_key or api_key == "your_api_key_here":
        return jsonify({"error": "Gemini API key is not configured."}), 500

    # ── Extract resume text ──
    if 'resume' not in request.files:
        return jsonify({"error": "No resume file provided."}), 400

    resume_file = request.files['resume']
    if not resume_file.filename or not allowed_file(resume_file.filename):
        return jsonify({"error": "Invalid resume format. Use PDF or DOCX."}), 400

    resume_path = save_upload(resume_file)
    resume_text = extract_text(resume_path)
    os.remove(resume_path)

    if not resume_text:
        return jsonify({"error": "Could not extract text from the resume."}), 400

    # ── Extract JD text ──
    jd_text = ""
    if 'jd_file' in request.files and request.files['jd_file'].filename:
        jd_file = request.files['jd_file']
        if not allowed_file(jd_file.filename):
            return jsonify({"error": "Invalid JD format. Use PDF, DOCX, or TXT."}), 400
        jd_path = save_upload(jd_file)
        jd_text = extract_text(jd_path)
        os.remove(jd_path)
    else:
        jd_text = request.form.get('jd_text', '').strip()

    if not jd_text:
        return jsonify({"error": "No job description provided."}), 400

    try:
        prompt = f"""
You are an expert ATS and recruitment analyst.

Compare the resume and job description below. Return ONLY a raw JSON object (no markdown, no extra text).

Rules:
- Use semantic matching for skills (e.g. "JS" = "JavaScript", "ML" = "Machine Learning", "React.js" = "React").
- For suggestions: do NOT invent experience, fabricate metrics, or make up projects the candidate has not mentioned.
  Only suggest how to rephrase or reposition skills the candidate already has.
- For the roadmap: only include skills listed under missing_skills. Do not include matched_skills.
- Prioritize required skills before preferred skills in the roadmap.
- Topics must be in learning order from beginner to advanced.

JSON schema (return exactly this structure):
{{
    "ats_score": <integer 0-100, ATS score of the resume alone>,
    "jd_match_score": <integer 0-100, how well resume matches JD>,
    "experience_level": "<e.g. Junior, Mid-level, Senior>",
    "matched_skills": [<skills present in both resume and JD>],
    "missing_skills": [<skills in JD but absent from resume>],
    "partial_matches": [
        {{"resume_term": "<what candidate wrote>", "jd_term": "<what JD requires>"}}
    ],
    "missing_sections": [<resume sections that are missing or weak>],
    "spelling_mistakes": [<spelling or grammar issues found in the resume>],
    "suggestions": [
        {{
            "skill": "<skill name>",
            "where_to_add": "<e.g. Skills section, Project bullet under Project X, Summary>",
            "original_bullet": "<existing resume text to improve, or empty string if adding new>",
            "improved_bullet": "<rewritten ATS-friendly bullet using strong action verbs>"
        }}
    ],
    "roadmap": [
        {{
            "skill": "<missing skill name>",
            "priority": "<required | preferred>",
            "prerequisites": [<prerequisite topics as strings>],
            "topics": [
                {{"name": "<subtopic name>", "level": "<beginner | intermediate | advanced>"}}
            ],
            "estimated_weeks": <integer>,
            "project_idea": "<a small, concrete project to demonstrate this skill>"
        }}
    ]
}}

Resume:
{resume_text}

Job Description:
{jd_text}
"""
        raw = call_gemini(prompt)
        result = parse_json_response(raw)
        return jsonify(result)

    except Exception as e:
        return jsonify({"error": str(e)}), 500



if __name__ == '__main__':
    app.run(debug=True, port=5000)
