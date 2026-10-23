// ── State ────────────────────────────────────────────────────────────────────
let jdAnalysisData = null;   // Full response from /analyze-jd
let hasJd = false;           // Whether user included a JD


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
            loadingText.textContent = 'Analyzing resume against job description...';

            var formData = new FormData();
            formData.append('resume', file);

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


// ── JD Match Score Display ───────────────────────────────────────────────────
// Called when user navigates to section-jd-score
(function() {
    // Observe section activation to populate JD results
    var observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(m) {
            if (m.target.id === 'section-jd-score' && m.target.classList.contains('active') && jdAnalysisData) {
                renderJdMatchScore();
            }
            if (m.target.id === 'section-skill-check' && m.target.classList.contains('active') && jdAnalysisData) {
                renderSkillChecklist();
            }
        });
    });

    // Observe all page sections for class changes
    document.querySelectorAll('.page-section').forEach(function(section) {
        observer.observe(section, { attributes: true, attributeFilter: ['class'] });
    });
})();

function renderJdMatchScore() {
    var d = jdAnalysisData;
    animateScore('jdScoreDisplay', 'jdRingFill', d.jd_match_score);

    var expEl = document.getElementById('expLevel');
    if (expEl) expEl.textContent = d.experience_level || 'Not specified';

    // Matched chips
    renderChips('matchedChips', d.matched_skills || [], 'matched');

    // Missing chips
    renderChips('missingChips', d.missing_skills || [], 'missing');

    // Partial match chips
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

function renderChips(containerId, items, cls) {
    var container = document.getElementById(containerId);
    container.innerHTML = '';
    if (items.length === 0) {
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
    var unknownSkills = [];

    checkboxes.forEach(function(cb) {
        if (!cb.checked) {
            unknownSkills.push(cb.dataset.skill);
        }
    });

    // Filter roadmap to only skills user does not have
    renderRoadmap(unknownSkills);
    goTo('section-roadmap');
}




// ── Learning Roadmap ─────────────────────────────────────────────────────────
function renderRoadmap(unknownSkills) {
    var container = document.getElementById('roadmapCards');
    container.innerHTML = '';

    var allRoadmap = jdAnalysisData.roadmap || [];

    // Filter to only skills user does not know
    var filtered = allRoadmap.filter(function(r) {
        return unknownSkills.some(function(s) {
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
        container.innerHTML = '<p style="color:var(--muted);">No skills to learn. You already have all the required skills.</p>';
        return;
    }

    // Load saved progress from localStorage
    var savedProgress = loadProgress();

    filtered.forEach(function(r, rIdx) {
        var card = document.createElement('div');
        var priorityClass = r.priority === 'required' ? 'priority-required' : 'priority-preferred';
        card.className = 'roadmap-card ' + priorityClass;

        var html = '';
        html += '<div class="skill-name">' + escHtml(r.skill) + '</div>';
        html += '<span class="priority-badge">' + escHtml(r.priority) + '</span>';

        // Prerequisites
        if (r.prerequisites && r.prerequisites.length > 0) {
            html += '<div class="prereqs"><strong>Prerequisites:</strong> ' + r.prerequisites.map(escHtml).join(', ') + '</div>';
        }

        // Estimated time
        if (r.estimated_weeks) {
            html += '<div class="est-time">Estimated time: ' + r.estimated_weeks + ' week' + (r.estimated_weeks > 1 ? 's' : '') + '</div>';
        }

        // Topics as checklist
        html += '<div class="topics-list">';
        (r.topics || []).forEach(function(t, tIdx) {
            var key = r.skill + '::' + t.name;
            var checked = savedProgress[key] ? ' checked' : '';
            var doneClass = savedProgress[key] ? ' done' : '';
            html += '<div class="topic-item' + doneClass + '" id="topic-' + rIdx + '-' + tIdx + '">';
            html += '<input type="checkbox" id="tc-' + rIdx + '-' + tIdx + '"' + checked;
            html += ' onchange="toggleTopic(\'' + escAttr(r.skill) + '\', \'' + escAttr(t.name) + '\', this, \'topic-' + rIdx + '-' + tIdx + '\')">';
            html += '<label for="tc-' + rIdx + '-' + tIdx + '">' + escHtml(t.name) + '</label>';
            html += '<span class="topic-level ' + t.level + '">' + t.level + '</span>';
            html += '</div>';
        });
        html += '</div>';

        // Project idea
        if (r.project_idea) {
            html += '<div class="project-idea"><strong>Project idea</strong>' + escHtml(r.project_idea) + '</div>';
        }

        card.innerHTML = html;
        container.appendChild(card);
    });
}

function toggleTopic(skill, topicName, checkbox, divId) {
    var key = skill + '::' + topicName;
    var progress = loadProgress();

    if (checkbox.checked) {
        progress[key] = true;
    } else {
        delete progress[key];
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
    return (str || '').replace(/'/g, "\\'").replace(/\\/g, '\\\\');
}
