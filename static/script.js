// ── State ────────────────────────────────────────────────────────────────────
let jdAnalysisData = null;   // Full response from /analyze-jd
let hasJd = false;           // Whether user included a JD
let selectedTopicsToLearn = []; // Topics user checked to learn
let selectedRatings = { ats: 5, roadmap: 5, interview: 5, standalone: 5 };
let currentInterviewFilter = 'all';


// ── Navigation ───────────────────────────────────────────────────────────────
function goTo(sectionId) {
    const current = document.querySelector('.page-section.active');
    const next = document.getElementById(sectionId);
    if (!next || current === next) return;

    current.classList.add('exit');
    current.classList.remove('active');

    setTimeout(function() {
        current.classList.remove('exit');
        next.classList.add('active');
        next.scrollTop = 0;
    }, 250);
}

function resetApp() {
    // Clear file inputs
    document.getElementById('resumeFile').value = '';
    document.getElementById('resumeFileName').textContent = 'Resume \u2014 click to select or drag and drop';

    var jdFileEl = document.getElementById('jdFile');
    if (jdFileEl) jdFileEl.value = '';
    var jdFileNameEl = document.getElementById('jdFileName');
    if (jdFileNameEl) jdFileNameEl.textContent = 'JD file \u2014 PDF, DOCX, or TXT';

    var jdTextEl = document.getElementById('jdText');
    if (jdTextEl) jdTextEl.value = '';

    var companyInput = document.getElementById('companyNameInput');
    if (companyInput) companyInput.value = '';

    // Reset toggle
    var jdToggle = document.getElementById('jdToggle');
    if (jdToggle) jdToggle.checked = false;
    var jdInput = document.getElementById('jdInputArea');
    if (jdInput) jdInput.classList.add('hidden');

    // Reset loading/error states
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('errorBox').classList.add('hidden');
    var submitBtn = document.getElementById('submitBtn');
    submitBtn.classList.remove('hidden');
    submitBtn.disabled = false;

    // Clear state
    jdAnalysisData = null;
    hasJd = false;
    selectedTopicsToLearn = [];
    updateSelectedTopicsUI();

    goTo('section-hero');
}


// ── JD Toggle ────────────────────────────────────────────────────────────────
document.getElementById('jdToggle').addEventListener('change', function() {
    var area = document.getElementById('jdInputArea');
    if (this.checked) {
        area.classList.remove('hidden');
    } else {
        area.classList.add('hidden');
    }
});


// ── JD Tabs ──────────────────────────────────────────────────────────────────
function switchJdTab(tab) {
    var pastePanel = document.getElementById('jdPastePanel');
    var filePanel = document.getElementById('jdFilePanel');
    var tabPaste = document.getElementById('tabPaste');
    var tabFile = document.getElementById('tabFile');

    if (tab === 'paste') {
        pastePanel.classList.remove('hidden');
        filePanel.classList.add('hidden');
        tabPaste.classList.add('active');
        tabFile.classList.remove('active');
    } else {
        pastePanel.classList.add('hidden');
        filePanel.classList.remove('hidden');
        tabPaste.classList.remove('active');
        tabFile.classList.add('active');
    }
}


// ── File Input Labels ────────────────────────────────────────────────────────
document.getElementById('resumeFile').addEventListener('change', function() {
    var span = document.getElementById('resumeFileName');
    if (this.files && this.files.length > 0) {
        span.textContent = this.files[0].name;
    } else {
        span.textContent = 'Resume \u2014 click to select or drag and drop';
    }
});

var jdFileInput = document.getElementById('jdFile');
if (jdFileInput) {
    jdFileInput.addEventListener('change', function() {
        var span = document.getElementById('jdFileName');
        if (this.files && this.files.length > 0) {
            span.textContent = this.files[0].name;
        } else {
            span.textContent = 'JD file \u2014 PDF, DOCX, or TXT';
        }
    });
}

// Drag and drop for resume
var resumeDropZone = document.getElementById('resumeDropZone');
if (resumeDropZone) {
    resumeDropZone.addEventListener('dragover', function(e) { e.preventDefault(); this.classList.add('dragover'); });
    resumeDropZone.addEventListener('dragleave', function() { this.classList.remove('dragover'); });
    resumeDropZone.addEventListener('drop', function(e) {
        e.preventDefault();
        this.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
            document.getElementById('resumeFile').files = e.dataTransfer.files;
            document.getElementById('resumeFileName').textContent = e.dataTransfer.files[0].name;
        }
    });
}

// Drag and drop for JD
var jdDropZone = document.getElementById('jdDropZone');
if (jdDropZone) {
    jdDropZone.addEventListener('dragover', function(e) { e.preventDefault(); this.classList.add('dragover'); });
    jdDropZone.addEventListener('dragleave', function() { this.classList.remove('dragover'); });
    jdDropZone.addEventListener('drop', function(e) {
        e.preventDefault();
        this.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
            document.getElementById('jdFile').files = e.dataTransfer.files;
            document.getElementById('jdFileName').textContent = e.dataTransfer.files[0].name;
        }
    });
}


// ── Form Submit ──────────────────────────────────────────────────────────────
document.getElementById('uploadForm').addEventListener('submit', async function(e) {
    e.preventDefault();

    var resumeFileInput = document.getElementById('resumeFile');
    var file = resumeFileInput.files[0];
    if (!file) { showError('Please select a resume file.'); return; }

    var btn = document.getElementById('submitBtn');
    var loading = document.getElementById('loading');
    var loadingText = document.getElementById('loadingText');
    var errorBox = document.getElementById('errorBox');

    btn.classList.add('hidden');
    loading.classList.remove('hidden');
    errorBox.classList.add('hidden');

    hasJd = document.getElementById('jdToggle').checked;

    try {
        if (hasJd) {
            // JD analysis path
            loadingText.textContent = 'Analyzing resume against job description and company profile...';

            var formData = new FormData();
            formData.append('resume', file);

            var companyInput = document.getElementById('companyNameInput');
            if (companyInput && companyInput.value.trim()) {
                formData.append('company_name', companyInput.value.trim());
            }

            var jdFileEl = document.getElementById('jdFile');
            var jdTextEl = document.getElementById('jdText');

            if (jdFileEl.files && jdFileEl.files.length > 0) {
                formData.append('jd_file', jdFileEl.files[0]);
            } else if (jdTextEl.value.trim()) {
                formData.append('jd_text', jdTextEl.value.trim());
            } else {
                throw new Error('Please provide a job description (paste text or upload a file).');
            }

            var response = await fetch('/analyze-jd', { method: 'POST', body: formData });
            var data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Analysis failed.');

            jdAnalysisData = data;

            // Show ATS score section with JD button
            showAtsScore(data.ats_score, data.missing_sections, [], data.spelling_mistakes);
            document.getElementById('jdNextBtn').classList.remove('hidden');

            // Render Company and Interview Prep sections proactively
            renderCompanyProfile();
            renderInterviewPrep();

        } else {
            // ATS-only path (original feature)
            loadingText.textContent = 'Analyzing your resume...';

            var formData2 = new FormData();
            formData2.append('file', file);

            var response2 = await fetch('/analyze', { method: 'POST', body: formData2 });
            var data2 = await response2.json();
            if (!response2.ok) throw new Error(data2.error || 'Analysis failed.');

            showAtsScore(data2.score, data2.missing_sections, data2.improvement_suggestions, data2.spelling_mistakes);
            document.getElementById('jdNextBtn').classList.add('hidden');
        }

        goTo('section-score');

    } catch (err) {
        showError(err.message);
        btn.classList.remove('hidden');
    } finally {
        loading.classList.add('hidden');
        btn.disabled = false;
    }
});


// ── ATS Score Display ────────────────────────────────────────────────────────
function showAtsScore(score, missing, suggestions, spelling) {
    animateScore('atsScoreDisplay', 'atsRingFill', score);
    populateList('missingList', missing, 'No missing sections found.');
    populateList('suggestionsList', suggestions, 'No suggestions at this stage.');
    populateList('spellingList', spelling, 'No spelling issues found.');
}

function animateScore(displayId, ringId, score) {
    var scoreEl = document.getElementById(displayId);
    var ringFill = document.getElementById(ringId);
    var circumference = 502.65;

    var cls = score >= 70 ? 'high' : 'low';
    scoreEl.className = 'score-number ' + cls;
    ringFill.className = 'ring-fill ' + cls;

    // Count up
    var current = 0;
    var step = Math.max(score / 90, 0.5);
    var counter = setInterval(function() {
        current = Math.min(current + step, score);
        scoreEl.textContent = Math.round(current);
        if (current >= score) clearInterval(counter);
    }, 16);

    // Ring animation
    var offset = circumference - (score / 100) * circumference;
    setTimeout(function() { ringFill.style.strokeDashoffset = offset; }, 100);
}

function populateList(listId, items, emptyMsg) {
    var ul = document.getElementById(listId);
    if (!ul) return;
    ul.innerHTML = '';
    var list = (!items || items.length === 0) ? [emptyMsg] : items;
    list.forEach(function(item) {
        var li = document.createElement('li');
        li.textContent = item;
        ul.appendChild(li);
    });
}


// ── Section Observer ─────────────────────────────────────────────────────────
(function() {
    var observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(m) {
            if (m.target.id === 'section-jd-score' && m.target.classList.contains('active') && jdAnalysisData) {
                renderJdMatchScore();
                renderCompanyProfile();
            }
            if (m.target.id === 'section-skill-check' && m.target.classList.contains('active') && jdAnalysisData) {
                renderSkillChecklist();
            }
            if (m.target.id === 'section-interview-prep' && m.target.classList.contains('active') && jdAnalysisData) {
                renderInterviewPrep();
            }
        });
    });

    document.querySelectorAll('.page-section').forEach(function(section) {
        observer.observe(section, { attributes: true, attributeFilter: ['class'] });
    });
})();


// ── JD Match Score & Company Profile Display ─────────────────────────────────
function renderJdMatchScore() {
    var d = jdAnalysisData;
    animateScore('jdScoreDisplay', 'jdRingFill', d.jd_match_score);

    var expEl = document.getElementById('expLevel');
    if (expEl) expEl.textContent = d.experience_level || 'Not specified';

    renderChips('matchedChips', d.matched_skills || [], 'matched');
    renderChips('missingChips', d.missing_skills || [], 'missing');

    var partialContainer = document.getElementById('partialChips');
    partialContainer.innerHTML = '';
    (d.partial_matches || []).forEach(function(p) {
        var chip = document.createElement('span');
        chip.className = 'chip partial';
        chip.textContent = p.resume_term + ' \u2248 ' + p.jd_term;
        partialContainer.appendChild(chip);
    });
    if (!d.partial_matches || d.partial_matches.length === 0) {
        partialContainer.innerHTML = '<span style="color:var(--muted);font-size:0.85rem;">None</span>';
    }
}

function renderCompanyProfile() {
    if (!jdAnalysisData) return;
    var comp = jdAnalysisData.company_profile;
    var compCard = document.getElementById('companyOverviewCard');
    if (!compCard) return;

    if (comp && comp.name) {
        document.getElementById('companyCardName').textContent = comp.name;
        document.getElementById('companyIndustryBadge').textContent = comp.industry || 'Technology';
        document.getElementById('companyAboutText').textContent = comp.about || 'Company overview not available.';
        document.getElementById('companyCultureText').textContent = comp.culture_and_values || 'Collaborative and growth-oriented work environment.';

        var techChips = document.getElementById('companyTechChips');
        techChips.innerHTML = '';
        (comp.key_technologies || []).forEach(function(tech) {
            var chip = document.createElement('span');
            chip.className = 'chip partial';
            chip.textContent = tech;
            techChips.appendChild(chip);
        });

        compCard.classList.remove('hidden');

        var targetCompEl = document.getElementById('interviewTargetCompany');
        if (targetCompEl) targetCompEl.textContent = comp.name;
    } else {
        compCard.classList.add('hidden');
    }
}

function renderChips(containerId, items, cls) {
    var container = document.getElementById(containerId);
    container.innerHTML = '';
    if (!items || items.length === 0) {
        container.innerHTML = '<span style="color:var(--muted);font-size:0.85rem;">None</span>';
        return;
    }
    items.forEach(function(s) {
        var chip = document.createElement('span');
        chip.className = 'chip ' + cls;
        chip.textContent = s;
        container.appendChild(chip);
    });
}


// ── Skill Checklist ──────────────────────────────────────────────────────────
function renderSkillChecklist() {
    var container = document.getElementById('skillCheckList');
    container.innerHTML = '';
    var missing = jdAnalysisData.missing_skills || [];

    if (missing.length === 0) {
        container.innerHTML = '<p style="color:var(--muted);">No missing skills to review.</p>';
        return;
    }

    missing.forEach(function(skill, i) {
        var div = document.createElement('div');
        div.className = 'skill-check-item';

        var cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.id = 'skill-cb-' + i;
        cb.dataset.skill = skill;

        var lbl = document.createElement('label');
        lbl.htmlFor = 'skill-cb-' + i;
        lbl.textContent = skill;

        div.appendChild(cb);
        div.appendChild(lbl);
        container.appendChild(div);
    });
}

function handleSkillChecks() {
    var checkboxes = document.querySelectorAll('#skillCheckList input[type="checkbox"]');
    var skillsToLearn = [];

    checkboxes.forEach(function(cb) {
        // checked = user wants to learn this skill → include in roadmap
        if (cb.checked) {
            skillsToLearn.push(cb.dataset.skill);
        }
    });

    renderRoadmap(skillsToLearn);
    goTo('section-roadmap');
}


// ── Learning Roadmap with Real YouTube Video Links ───────────────────────────
function renderRoadmap(skillsToLearn) {
    var container = document.getElementById('roadmapCards');
    container.innerHTML = '';

    var allRoadmap = jdAnalysisData.roadmap || [];

    // Filter to only skills user checked (wants to learn)
    var filtered = allRoadmap.filter(function(r) {
        return skillsToLearn.some(function(s) {
            return s.toLowerCase() === r.skill.toLowerCase();
        });
    });

    // Sort: required first, then preferred
    filtered.sort(function(a, b) {
        if (a.priority === 'required' && b.priority !== 'required') return -1;
        if (a.priority !== 'required' && b.priority === 'required') return 1;
        return 0;
    });

    if (filtered.length === 0) {
        container.innerHTML = '<p style="color:var(--muted);">No skills selected for the roadmap. Go back and check the skills you want to learn.</p>';
        return;
    }

    var savedProgress = loadProgress();

    filtered.forEach(function(r, rIdx) {
        var card = document.createElement('div');
        var priorityClass = r.priority === 'required' ? 'priority-required' : 'priority-preferred';
        card.className = 'roadmap-card ' + priorityClass;

        var html = '';
        html += '<div class="skill-name">' + escHtml(r.skill) + '</div>';
        html += '<span class="priority-badge">' + escHtml(r.priority) + '</span>';

        if (r.prerequisites && r.prerequisites.length > 0) {
            html += '<div class="prereqs"><strong>Prerequisites:</strong> ' + r.prerequisites.map(escHtml).join(', ') + '</div>';
        }

        if (r.estimated_weeks) {
            html += '<div class="est-time">Estimated time: ' + r.estimated_weeks + ' week' + (r.estimated_weeks > 1 ? 's' : '') + '</div>';
        }

        // Topics list — YouTube links resolved asynchronously
        html += '<div class="topics-list">';
        (r.topics || []).forEach(function(t, tIdx) {
            var key = r.skill + '::' + t.name;
            var checked = savedProgress[key] ? ' checked' : '';
            var doneClass = savedProgress[key] ? ' done' : '';
            var ytQuery = t.yt_search || (r.skill + ' ' + t.name + ' tutorial');
            var topicId = 'topic-' + rIdx + '-' + tIdx;
            var ytBtnId = 'yt-btn-' + rIdx + '-' + tIdx;

            html += '<div class="topic-item' + doneClass + '" id="' + topicId + '">';
            html += '<input type="checkbox" id="tc-' + rIdx + '-' + tIdx + '"' + checked;
            html += ' onchange="toggleTopicLearning(\'' + escAttr(r.skill) + '\', \'' + escAttr(t.name) + '\', \'' + escAttr(t.level) + '\', \'' + escAttr(ytQuery) + '\', this, \'' + topicId + '\')">';
            html += '<label for="tc-' + rIdx + '-' + tIdx + '">' + escHtml(t.name) + '</label>';
            html += '<span class="topic-level ' + t.level + '">' + t.level + '</span>';
            // Placeholder link — will be replaced with real video URL
            html += '<a href="#" id="' + ytBtnId + '" target="_blank" rel="noopener noreferrer" class="yt-link-btn loading-yt" data-query="' + escAttr(ytQuery) + '" title="Loading video...">&#9654; Loading...</a>';
            html += '</div>';
        });
        html += '</div>';

        if (r.project_idea) {
            html += '<div class="project-idea"><strong>Project idea</strong>' + escHtml(r.project_idea) + '</div>';
        }

        card.innerHTML = html;
        container.appendChild(card);
    });

    updateSelectedTopicsUI();

    // Resolve all YouTube links asynchronously after render
    resolveAllYtLinks();
}

// Resolve all .loading-yt buttons to real YouTube video URLs
function resolveAllYtLinks() {
    var buttons = document.querySelectorAll('.yt-link-btn.loading-yt');
    buttons.forEach(function(btn) {
        var query = btn.dataset.query;
        if (!query) return;

        fetch('/get-yt-link?' + new URLSearchParams({ q: query }))
            .then(function(res) { return res.json(); })
            .then(function(data) {
                if (data.url) {
                    btn.href = data.url;
                    btn.textContent = '\u25b6 YouTube';
                    btn.classList.remove('loading-yt');
                    // Also update in selectedTopicsToLearn if this topic was already added
                    selectedTopicsToLearn.forEach(function(item) {
                        if (item.ytQuery === query) {
                            item.ytUrl = data.url;
                        }
                    });
                    updateSelectedTopicsUI();
                }
            })
            .catch(function() {
                // On error, fall back to search page
                btn.href = 'https://www.youtube.com/results?search_query=' + encodeURIComponent(query);
                btn.textContent = '\u25b6 YouTube';
                btn.classList.remove('loading-yt');
            });
    });
}

function toggleTopicLearning(skill, topicName, level, ytQuery, checkbox, divId) {
    var key = skill + '::' + topicName;
    var progress = loadProgress();

    // Get the resolved YouTube URL from the rendered button if available
    var resolvedUrl = 'https://www.youtube.com/results?search_query=' + encodeURIComponent(ytQuery);
    var ytBtn = document.querySelector('#' + divId + ' .yt-link-btn');
    if (ytBtn && ytBtn.href && !ytBtn.classList.contains('loading-yt')) {
        resolvedUrl = ytBtn.href;
    }

    if (checkbox.checked) {
        progress[key] = true;
        // Add to selected topics to learn
        if (!selectedTopicsToLearn.some(item => item.key === key)) {
            selectedTopicsToLearn.push({
                key: key,
                skill: skill,
                topic: topicName,
                level: level,
                ytQuery: ytQuery,
                ytUrl: resolvedUrl
            });
        }
    } else {
        delete progress[key];
        selectedTopicsToLearn = selectedTopicsToLearn.filter(item => item.key !== key);
    }

    saveProgress(progress);

    var div = document.getElementById(divId);
    if (div) {
        if (checkbox.checked) {
            div.classList.add('done');
        } else {
            div.classList.remove('done');
        }
    }

    updateSelectedTopicsUI();
}

function updateSelectedTopicsUI() {
    var queueCard = document.getElementById('selectedTopicsQueue');
    var listEl = document.getElementById('selectedTopicsList');
    var countEl = document.getElementById('selectedCount');
    if (!queueCard || !listEl) return;

    if (selectedTopicsToLearn.length === 0) {
        queueCard.classList.add('hidden');
        listEl.innerHTML = '';
        if (countEl) countEl.textContent = '0';
        return;
    }

    queueCard.classList.remove('hidden');
    if (countEl) countEl.textContent = selectedTopicsToLearn.length;
    listEl.innerHTML = '';

    selectedTopicsToLearn.forEach(function(item) {
        var row = document.createElement('div');
        row.className = 'selected-topic-pill';
        row.innerHTML = '<strong>' + escHtml(item.skill) + ':</strong> ' + escHtml(item.topic) +
            ' <span class="topic-level ' + escHtml(item.level) + '">' + escHtml(item.level) + '</span> ' +
            '<a href="' + item.ytUrl + '" target="_blank" rel="noopener noreferrer" class="yt-link-btn">&#9654; Learn on YouTube</a>';
        listEl.appendChild(row);
    });
}

function clearSelectedTopics() {
    selectedTopicsToLearn = [];
    document.querySelectorAll('.topics-list input[type="checkbox"]').forEach(function(cb) {
        cb.checked = false;
        var parent = cb.closest('.topic-item');
        if (parent) parent.classList.remove('done');
    });
    localStorage.removeItem('ats_roadmap_progress');
    updateSelectedTopicsUI();
}

function loadProgress() {
    try {
        return JSON.parse(localStorage.getItem('ats_roadmap_progress') || '{}');
    } catch (e) {
        return {};
    }
}

function saveProgress(obj) {
    localStorage.setItem('ats_roadmap_progress', JSON.stringify(obj));
}


// ── Real Interview Experiences & Questions ───────────────────────────────────
function renderInterviewPrep() {
    if (!jdAnalysisData) return;
    var prep = jdAnalysisData.interview_prep;
    var comp = jdAnalysisData.company_profile;

    var companyName = (comp && comp.name) || (prep && prep.company) || 'Target Company';
    var targetCompEl = document.getElementById('interviewTargetCompany');
    if (targetCompEl) targetCompEl.textContent = companyName;

    if (!prep) return;

    var processEl = document.getElementById('hiringProcessText');
    if (processEl) {
        processEl.textContent = prep.hiring_process_overview || 'Online assessment followed by technical problem-solving rounds and managerial/cultural fit evaluation.';
    }

    var expSummaryEl = document.getElementById('experienceSummaryText');
    if (expSummaryEl) {
        expSummaryEl.textContent = prep.experience_summary || 'Candidates report standard technical assessments emphasizing structured thinking, communication, and core domain knowledge.';
    }

    // Render questions
    renderInterviewQuestionsList(prep.interview_questions || []);

    // Render candidate tips
    var tipsList = document.getElementById('interviewTipsList');
    if (tipsList) {
        tipsList.innerHTML = '';
        var tips = prep.company_interview_tips || [
            'Practice articulating your thought process out loud while writing code or solving problems.',
            'Review key projects from your resume; interviewers dig deep into technical decisions and trade-offs.',
            'Familiarize yourself with company core values and prepare STAR-method stories for behavioral rounds.'
        ];
        tips.forEach(function(tip) {
            var li = document.createElement('li');
            li.textContent = tip;
            tipsList.appendChild(li);
        });
    }
}

function renderInterviewQuestionsList(questions) {
    var container = document.getElementById('interviewQuestionsCards');
    if (!container) return;
    container.innerHTML = '';

    if (!questions || questions.length === 0) {
        container.innerHTML = '<p style="color:var(--muted);">No interview questions generated yet.</p>';
        return;
    }

    questions.forEach(function(q, idx) {
        var card = document.createElement('div');
        card.className = 'interview-q-card';
        card.dataset.category = q.category || 'General';

        var catCls = getCategorySlug(q.category);

        var html = '';
        html += '<div class="q-card-top">';
        html += '<span class="q-category-badge ' + catCls + '">' + escHtml(q.category || 'General') + '</span>';
        html += '<button type="button" class="copy-q-btn" onclick="copyQuestion(this, \'' + escAttr(q.question) + '\')">Copy</button>';
        html += '</div>';
        html += '<p class="q-text">' + escHtml(q.question) + '</p>';

        if (q.context_or_tip) {
            html += '<div class="q-tip"><strong>Interview Tip:</strong> ' + escHtml(q.context_or_tip) + '</div>';
        }

        card.innerHTML = html;
        container.appendChild(card);
    });

    applyInterviewFilter();
}

function filterInterviewQuestions(category, button) {
    currentInterviewFilter = category;
    document.querySelectorAll('.question-filters .filter-btn').forEach(function(btn) {
        btn.classList.remove('active');
    });
    if (button) button.classList.add('active');
    applyInterviewFilter();
}

function applyInterviewFilter() {
    var cards = document.querySelectorAll('.interview-q-card');
    cards.forEach(function(card) {
        if (currentInterviewFilter === 'all') {
            card.classList.remove('hidden');
        } else {
            var cat = card.dataset.category || '';
            if (cat.toLowerCase().includes(currentInterviewFilter.toLowerCase()) || currentInterviewFilter.toLowerCase().includes(cat.toLowerCase())) {
                card.classList.remove('hidden');
            } else {
                card.classList.add('hidden');
            }
        }
    });
}

function getCategorySlug(category) {
    if (!category) return 'cat-general';
    var lower = category.toLowerCase();
    if (lower.includes('coding') || lower.includes('dsa')) return 'cat-coding';
    if (lower.includes('technical') || lower.includes('core')) return 'cat-tech';
    if (lower.includes('system') || lower.includes('design')) return 'cat-design';
    if (lower.includes('behavioral') || lower.includes('culture') || lower.includes('hr')) return 'cat-behavioral';
    return 'cat-general';
}

function copyQuestion(btn, text) {
    navigator.clipboard.writeText(text).then(function() {
        var original = btn.textContent;
        btn.textContent = 'Copied!';
        btn.classList.add('copied');
        setTimeout(function() {
            btn.textContent = original;
            btn.classList.remove('copied');
        }, 1500);
    });
}


// ── Feedback System (At End of Analysis & Standalone) ─────────────────────────
function setStarRating(target, rating) {
    selectedRatings[target] = rating;
    var container = document.querySelector('.star-rating[data-target="' + target + '"]');
    if (!container) return;

    var stars = container.querySelectorAll('.star-btn');
    stars.forEach(function(star) {
        var val = parseInt(star.dataset.value, 10);
        if (val <= rating) {
            star.classList.add('active');
        } else {
            star.classList.remove('active');
        }
    });

    var standaloneInput = document.getElementById('standaloneRatingValue');
    if (target === 'standalone' && standaloneInput) {
        standaloneInput.value = rating;
    }
}

function toggleFeedbackTag(btn) {
    btn.classList.toggle('active');
}

async function submitAnalysisFeedback(target) {
    var rating = selectedRatings[target] || 5;
    var textarea = document.getElementById(target + 'FeedbackText');
    var statusEl = document.getElementById(target + 'FeedbackStatus');
    var tagsContainer = document.getElementById(target + 'Tags');

    var comment = textarea ? textarea.value.trim() : '';
    var tags = [];
    if (tagsContainer) {
        tagsContainer.querySelectorAll('.tag-pill.active').forEach(function(pill) {
            tags.push(pill.textContent.trim());
        });
    }

    try {
        var res = await fetch('/feedback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                rating: rating,
                comment: comment,
                tags: tags,
                source: target + '_analysis'
            })
        });

        var data = await res.json();
        if (statusEl) {
            statusEl.textContent = '\u2713 ' + (data.message || 'Thank you for your feedback!');
            statusEl.className = 'feedback-status-msg success';
            statusEl.classList.remove('hidden');
        }

        if (textarea) textarea.value = '';
        if (tagsContainer) {
            tagsContainer.querySelectorAll('.tag-pill').forEach(p => p.classList.remove('active'));
        }

    } catch (err) {
        if (statusEl) {
            statusEl.textContent = 'Feedback received! Thank you for helping us improve.';
            statusEl.className = 'feedback-status-msg success';
            statusEl.classList.remove('hidden');
        }
    }
}

// Standalone feedback form
var standaloneForm = document.getElementById('standaloneFeedbackForm');
if (standaloneForm) {
    standaloneForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        var name = document.getElementById('feedbackName').value.trim();
        var rating = selectedRatings['standalone'] || 5;
        var comment = document.getElementById('feedbackMessage').value.trim();
        var statusEl = document.getElementById('feedbackStatus');

        var tags = [];
        document.querySelectorAll('#standaloneTags .tag-pill.active').forEach(function(pill) {
            tags.push(pill.textContent.trim());
        });

        try {
            var res = await fetch('/feedback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: name || 'Anonymous',
                    rating: rating,
                    comment: comment,
                    tags: tags,
                    source: 'standalone_feedback'
                })
            });
            var data = await res.json();
            statusEl.textContent = '\u2713 ' + (data.message || 'Thank you for your feedback!');
            statusEl.className = 'feedback-status-msg success';
            statusEl.classList.remove('hidden');
            standaloneForm.reset();
            setStarRating('standalone', 5);
            document.querySelectorAll('#standaloneTags .tag-pill').forEach(p => p.classList.remove('active'));
        } catch (err) {
            statusEl.textContent = '\u2713 Thank you for your feedback!';
            statusEl.className = 'feedback-status-msg success';
            statusEl.classList.remove('hidden');
        }
    });
}


// ── STANDALONE: Learning Resources Search ─────────────────────────────────────
function searchTopicResources() {
    var input = document.getElementById('resourceSearchInput');
    var container = document.getElementById('dynamicResourceResults');
    var query = input.value.trim();
    if (!query) return;

    container.innerHTML = '';

    var ytSearchUrl = 'https://www.youtube.com/results?search_query=' + encodeURIComponent(query + ' tutorial full course');
    var ytCrashUrl = 'https://www.youtube.com/results?search_query=' + encodeURIComponent(query + ' crash course for beginners');
    var docSearchUrl = 'https://www.google.com/search?q=' + encodeURIComponent(query + ' official documentation tutorial');

    var card = document.createElement('div');
    card.className = 'resource-card highlight';
    card.innerHTML = '<h3>' + escHtml(query) + '</h3>' +
        '<p>Direct learning links &amp; YouTube video tutorials for <strong>' + escHtml(query) + '</strong>:</p>' +
        '<div class="resource-links" style="margin-top: 1rem;">' +
        '<a href="' + ytSearchUrl + '" target="_blank" rel="noopener noreferrer" class="yt-link-btn">&#9654; Full YouTube Tutorials</a> ' +
        '<a href="' + ytCrashUrl + '" target="_blank" rel="noopener noreferrer" class="yt-link-btn">&#9654; Crash Course</a> ' +
        '<a href="' + docSearchUrl + '" target="_blank" rel="noopener noreferrer" class="doc-link-btn">Official Documentation</a>' +
        '</div>';

    container.appendChild(card);
}


// ── STANDALONE: Company Profile Search ───────────────────────────────────────
async function searchCompanyProfile() {
    var input = document.getElementById('companySearchInput');
    var result = document.getElementById('companySearchResult');
    var loading = document.getElementById('companySearchLoading');
    var company = input.value.trim();

    if (!company) {
        result.innerHTML = '<p class="error-box">Please enter a company name.</p>';
        return;
    }

    loading.classList.remove('hidden');
    result.innerHTML = '';

    try {
        var res = await fetch('/company-info', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ company: company })
        });
        var data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to fetch company information.');

        var html = '<div class="company-card" style="margin-top: 1.5rem;">';
        html += '<div class="company-card-header">';
        html += '<div><span class="company-badge">' + escHtml(data.industry || 'Technology') + '</span>';
        html += '<h3>' + escHtml(data.name || company) + '</h3></div>';
        html += '</div>';
        html += '<p class="company-about">' + escHtml(data.about || '') + '</p>';

        html += '<div class="company-details-grid">';
        html += '<div class="company-subcard"><strong>Work Culture &amp; Values</strong>';
        html += '<p class="culture-text">' + escHtml(data.culture_and_values || '') + '</p></div>';

        html += '<div class="company-subcard"><strong>Core Technologies</strong><div class="chip-row" style="margin-top:0.5rem;">';
        (data.key_technologies || []).forEach(function(tech) {
            html += '<span class="chip partial">' + escHtml(tech) + '</span>';
        });
        html += '</div></div></div>';

        if (data.hiring_process_overview) {
            html += '<div class="process-box" style="margin-top:1.25rem;"><h4>Hiring Process Overview</h4><p>' + escHtml(data.hiring_process_overview) + '</p></div>';
        }

        if (data.interview_questions && data.interview_questions.length > 0) {
            html += '<h4 style="margin-top: 1.5rem; margin-bottom: 0.75rem;">Past Questions from Real Candidates</h4>';
            html += '<div class="interview-questions-grid">';
            data.interview_questions.forEach(function(q) {
                html += '<div class="interview-q-card">';
                html += '<div class="q-card-top"><span class="q-category-badge ' + getCategorySlug(q.category) + '">' + escHtml(q.category || 'Technical') + '</span></div>';
                html += '<p class="q-text">' + escHtml(q.question) + '</p>';
                if (q.context_or_tip) html += '<div class="q-tip"><strong>Tip:</strong> ' + escHtml(q.context_or_tip) + '</div>';
                html += '</div>';
            });
            html += '</div>';
        }

        html += '</div>';
        result.innerHTML = html;

    } catch (err) {
        result.innerHTML = '<div class="company-card" style="margin-top: 1.5rem;">' +
            '<h3>' + escHtml(company) + '</h3>' +
            '<p class="company-about">Explore company careers, culture and past interview experiences:</p>' +
            '<div style="margin-top: 1rem;">' +
            '<a href="https://www.google.com/search?q=' + encodeURIComponent(company + ' interview experiences glassdoor leetcode ambitionbox') + '" target="_blank" rel="noopener noreferrer" class="cta-btn secondary">Search Real Interview Debriefs &rarr;</a>' +
            '</div></div>';
    } finally {
        loading.classList.add('hidden');
    }
}


// ── STANDALONE: Interview Questions Search ────────────────────────────────────
async function searchInterviewQuestions() {
    var role = document.getElementById('standaloneRoleSelect').value;
    var company = document.getElementById('standaloneCompanyInput').value.trim();
    var container = document.getElementById('standaloneInterviewQuestionsContainer');
    var loading = document.getElementById('interviewSearchLoading');

    loading.classList.remove('hidden');
    container.innerHTML = '';

    try {
        var res = await fetch('/interview-questions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: role, company: company })
        });
        var data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to fetch interview questions.');

        var html = '<div class="interview-questions-grid">';
        (data.questions || []).forEach(function(q) {
            html += '<div class="interview-q-card">';
            html += '<div class="q-card-top">';
            html += '<span class="q-category-badge ' + getCategorySlug(q.category) + '">' + escHtml(q.category || 'Technical') + '</span>';
            html += '<button type="button" class="copy-q-btn" onclick="copyQuestion(this, \'' + escAttr(q.question) + '\')">Copy</button>';
            html += '</div>';
            html += '<p class="q-text">' + escHtml(q.question) + '</p>';
            if (q.context_or_tip) {
                html += '<div class="q-tip"><strong>Tip:</strong> ' + escHtml(q.context_or_tip) + '</div>';
            }
            html += '</div>';
        });
        html += '</div>';

        if (data.tips && data.tips.length > 0) {
            html += '<div class="feedback-card" style="margin-top: 1.5rem;"><div class="card-header"><h4>Preparation Tips</h4></div><ul>';
            data.tips.forEach(function(t) { html += '<li>' + escHtml(t) + '</li>'; });
            html += '</ul></div>';
        }

        container.innerHTML = html;

    } catch (err) {
        container.innerHTML = '<p class="error-box">' + escHtml(err.message) + '</p>';
    } finally {
        loading.classList.add('hidden');
    }
}


// ── Utilities ────────────────────────────────────────────────────────────────
function showError(msg) {
    var box = document.getElementById('errorBox');
    box.textContent = 'Error: ' + msg;
    box.classList.remove('hidden');
}

function escHtml(str) {
    var div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
}

function escAttr(str) {
    return (str || '').replace(/'/g, "\\'").replace(/\\/g, '\\\\').replace(/"/g, '&quot;');
}

// Initialize default star ratings on load
document.addEventListener('DOMContentLoaded', function() {
    setStarRating('ats', 5);
    setStarRating('roadmap', 5);
    setStarRating('interview', 5);
    setStarRating('standalone', 5);
});
