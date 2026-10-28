import os
import json
import time
import re
import urllib.request
import urllib.parse
from concurrent.futures import ThreadPoolExecutor
from flask import Flask, request, jsonify, render_template
import google.generativeai as genai
from dotenv import load_dotenv
import PyPDF2
import docx2txt
from werkzeug.utils import secure_filename

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
dotenv_path = os.path.join(BASE_DIR, '.env')
load_dotenv(dotenv_path)

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = os.path.join(BASE_DIR, 'uploads')
app.config['MAX_CONTENT_LENGTH'] = 5 * 1024 * 1024  # 5MB max
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

# ── Gemini setup ──────────────────────────────────────────────────────────────
api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
if api_key and api_key != "your_api_key_here":
    os.environ["GEMINI_API_KEY"] = api_key
    os.environ["GOOGLE_API_KEY"] = api_key
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


# ── LLM call helper with fast fallback and retry ─────────────────────────────
def call_gemini(prompt, max_retries=2):
    """Call Gemini and return response text. Uses high-speed flash-lite models with instant fallback."""
    models_to_try = [
        os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite"),
        "gemini-flash-lite-latest",
        "gemini-3.6-flash",
        "gemini-3.5-flash",
        "gemini-3.8-flash"
    ]
    seen = set()
    models = [m for m in models_to_try if not (m in seen or seen.add(m))]

    last_error = None
    for model_name in models:
        try:
            model = genai.GenerativeModel(model_name)
            for attempt in range(max_retries):
                try:
                    response = model.generate_content(prompt)
                    return response.text.strip()
                except Exception as e:
                    err_str = str(e).lower()
                    if '429' in err_str or 'quota' in err_str:
                        print(f"Rate limit on {model_name}. Instantly switching to fallback model...")
                        break
                    elif attempt < max_retries - 1:
                        time.sleep(1)
                    else:
                        raise
        except Exception as e:
            last_error = e
            err_str = str(e).lower()
            if '404' in err_str or 'not found' in err_str or '429' in err_str or 'quota' in err_str:
                continue
            raise
    if last_error:
        raise last_error


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


# ── POST /analyze-jd — ATS score + JD gap analysis (parallelized) ─────────────
@app.route('/analyze-jd', methods=['POST'])
def analyze_jd():
    """
    Accepts:
      - resume: file (PDF/DOCX)
      - jd_file: file (PDF/DOCX/TXT) — optional
      - jd_text: string — optional (used if jd_file not provided)

    Returns combined JSON from two parallel LLM calls:
      Call 1: ATS score, JD match, skills, suggestions, roadmap
      Call 2: Company profile, interview prep
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
    company_name = request.form.get('company_name', '').strip()
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
        company_context = f"Company: {company_name}" if company_name else "Company: detect from JD or use industry-standard profile"

        # ── Prompt 1: Core analysis (ATS + JD match + skills + roadmap) ──
        prompt_core = f"""You are an expert ATS and recruitment analyst.
Compare the resume and job description. {company_context}
Return ONLY a raw JSON object (no markdown fences).

Rules:
- Semantic matching for skills (e.g. "JS"="JavaScript", "ML"="Machine Learning", "React.js"="React").
- Suggestions: do NOT invent experience or fabricate metrics. Only rephrase existing skills.
- Roadmap: only missing_skills. Required before preferred. Topics beginner to advanced.
- Each roadmap topic: include 'yt_search' with YouTube tutorial search keywords.

JSON schema:
{{
    "ats_score": <int 0-100>,
    "jd_match_score": <int 0-100>,
    "experience_level": "<Junior|Mid-level|Senior>",
    "matched_skills": [<strings>],
    "missing_skills": [<strings>],
    "partial_matches": [{{"resume_term":"<>","jd_term":"<>"}}],
    "missing_sections": [<strings>],
    "spelling_mistakes": [<strings>],
    "suggestions": [{{
        "skill":"<>",
        "where_to_add":"<>",
        "original_bullet":"<>",
        "improved_bullet":"<>"
    }}],
    "roadmap": [{{
        "skill":"<>",
        "priority":"<required|preferred>",
        "prerequisites":[<strings>],
        "topics":[{{"name":"<>","level":"<beginner|intermediate|advanced>","yt_search":"<>"}}],
        "estimated_weeks":<int>,
        "project_idea":"<>"
    }}]
}}

Resume:
{resume_text}

Job Description:
{jd_text}
"""

        # ── Prompt 2: Company profile + interview prep ──
        prompt_company = f"""You are an expert recruiter and interview coach.
{company_context}
Role context from JD: {jd_text[:500]}

Based on real interview experiences from Glassdoor, LeetCode Discuss, AmbitionBox, GeeksforGeeks, provide company profile and interview preparation.
Return ONLY a raw JSON object (no markdown fences).

JSON schema:
{{
    "company_profile": {{
        "name":"<>",
        "industry":"<>",
        "about":"<2-3 sentences>",
        "culture_and_values":"<>",
        "key_technologies":[<4-6 strings>]
    }},
    "interview_prep": {{
        "company":"<>",
        "hiring_process_overview":"<interview stages>",
        "experience_summary":"<real candidate feedback summary>",
        "interview_questions":[{{
            "category":"<Coding & DSA|Technical & Core|System Design|Behavioral & Culture>",
            "question":"<real interview question>",
            "context_or_tip":"<what interviewer evaluates>"
        }}],
        "company_interview_tips":["<actionable tip>"]
    }}
}}
"""

        # ── Run both prompts in parallel ──
        with ThreadPoolExecutor(max_workers=2) as executor:
            future_core = executor.submit(call_gemini, prompt_core)
            future_company = executor.submit(call_gemini, prompt_company)

            raw_core = future_core.result()
            raw_company = future_company.result()

        result_core = parse_json_response(raw_core)
        result_company = parse_json_response(raw_company)

        # ── Merge both results into one response ──
        result_core["company_profile"] = result_company.get("company_profile", {})
        result_core["interview_prep"] = result_company.get("interview_prep", {})

        return jsonify(result_core)

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ── POST /feedback — Save user feedback ───────────────────────────────────────
@app.route('/feedback', methods=['POST'])
def submit_feedback():
    """Save user feedback to feedback.json."""
    try:
        data = request.get_json(silent=True) or request.form.to_dict()
        if not data:
            return jsonify({"error": "No feedback data provided."}), 400

        entry = {
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
            "rating": data.get("rating"),
            "comment": data.get("comment", "").strip(),
            "tags": data.get("tags", []),
            "name": data.get("name", "Anonymous").strip() or "Anonymous",
            "source": data.get("source", "analysis")
        }

        feedback_file = os.path.join(os.path.dirname(__file__), "feedback.json")
        feedbacks = []
        if os.path.exists(feedback_file):
            try:
                with open(feedback_file, "r", encoding="utf-8") as f:
                    feedbacks = json.load(f)
            except Exception:
                feedbacks = []

        feedbacks.append(entry)
        with open(feedback_file, "w", encoding="utf-8") as f:
            json.dump(feedbacks, f, indent=2)

        return jsonify({"status": "success", "message": "Thank you for your feedback!"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ── POST /company-info — Standalone company profile & insights ────────────────
@app.route('/company-info', methods=['POST'])
def get_company_info():
    """Fetch company profile, culture, tech stack and interview experiences."""
    if not api_key or api_key == "your_api_key_here":
        return jsonify({"error": "Gemini API key is not configured."}), 500

    data = request.get_json(silent=True) or request.form.to_dict()
    company = data.get("company", "").strip() if data else ""
    role = data.get("role", "").strip() if data else ""

    if not company:
        return jsonify({"error": "Please provide a company name."}), 400

    prompt = f"""
You are an expert recruiter and interview researcher.
Provide an accurate, detailed company profile and past interview questions based on real candidate experiences from Glassdoor, LeetCode Discuss, AmbitionBox, and GeeksforGeeks.

Company: {company}
Role: {role or "Software Engineer / Tech Role"}

Return ONLY a raw JSON object:
{{
    "name": "{company}",
    "industry": "<industry domain, e.g. Cloud, E-commerce, FinTech>",
    "about": "<2-3 sentence overview of what the company does, products, scale>",
    "culture_and_values": "<work culture, employee values, work-life balance>",
    "key_technologies": [<top 5-8 technologies used>],
    "hiring_process_overview": "<interview rounds breakdown>",
    "experience_summary": "<candidate feedback summary: difficulty, interviewer style>",
    "interview_questions": [
        {{
            "category": "<Coding & DSA | Technical & Core | System Design | Behavioral & Culture>",
            "question": "<real interview question asked at {company}>",
            "context_or_tip": "<what interviewers look for or how to answer>"
        }}
    ],
    "company_interview_tips": [<3-4 actionable tips based on real experiences>]
}}
"""
    try:
        raw = call_gemini(prompt)
        result = parse_json_response(raw)
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ── POST /interview-questions — Standalone role/company interview questions ────
@app.route('/interview-questions', methods=['POST'])
def get_interview_questions():
    """Fetch interview questions from real experiences for role and company."""
    if not api_key or api_key == "your_api_key_here":
        return jsonify({"error": "Gemini API key is not configured."}), 500

    data = request.get_json(silent=True) or request.form.to_dict()
    role = data.get("role", "Software Engineer").strip() if data else "Software Engineer"
    company = data.get("company", "").strip() if data else ""

    prompt = f"""
You are a technical interview preparation expert.
Provide realistic interview questions and preparation advice based on past interview experiences shared by real candidates on the web (Glassdoor, LeetCode Discuss, AmbitionBox, GeeksforGeeks).

Role: {role}
Company: {company or "General Tech Industry"}

Return ONLY a raw JSON object:
{{
    "role": "{role}",
    "company": "{company or 'General Tech Industry'}",
    "hiring_process_overview": "<summary of common interview stages>",
    "questions": [
        {{
            "category": "<Coding & DSA | Technical & Core | System Design | Behavioral & Culture>",
            "question": "<real question asked in interviews>",
            "context_or_tip": "<what interviewers evaluate / answer advice>"
        }}
    ],
    "tips": [<top 3 actionable interview preparation tips>]
}}
"""
    try:
        raw = call_gemini(prompt)
        result = parse_json_response(raw)
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ── GET /get-yt-link — resolve a real YouTube video URL from a search query ────
@app.route('/get-yt-link', methods=['GET'])
def get_yt_link():
    """
    Scrapes the first organic YouTube video result for a given search query.
    Returns a direct watch URL and video title.

    Query param: q=<search query>
    """
    query = request.args.get('q', '').strip()
    if not query:
        return jsonify({"error": "No query provided."}), 400

    try:
        encoded_query = urllib.parse.quote(query)
        url = f"https://www.youtube.com/results?search_query={encoded_query}"

        req = urllib.request.Request(
            url,
            headers={
                'User-Agent': (
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
                    'AppleWebKit/537.36 (KHTML, like Gecko) '
                    'Chrome/120.0.0.0 Safari/537.36'
                ),
                'Accept-Language': 'en-US,en;q=0.9',
            }
        )
        html = urllib.request.urlopen(req, timeout=6).read().decode('utf-8')

        # Extract video IDs from the page (first match = highest ranked result)
        video_ids = re.findall(r'"videoId":"([a-zA-Z0-9_-]{11})"', html)

        if not video_ids:
            # Fallback: return a search page URL if scraping fails
            return jsonify({
                "url": f"https://www.youtube.com/results?search_query={encoded_query}",
                "is_search": True
            })

        video_id = video_ids[0]
        video_url = f"https://www.youtube.com/watch?v={video_id}"

        return jsonify({
            "url": video_url,
            "video_id": video_id,
            "is_search": False
        })

    except Exception as e:
        # Fallback to search page on any error
        encoded_query = urllib.parse.quote(query)
        return jsonify({
            "url": f"https://www.youtube.com/results?search_query={encoded_query}",
            "is_search": True,
            "error": str(e)
        })


if __name__ == '__main__':
    app.run(debug=True, port=5000)
