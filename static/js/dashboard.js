// Dashboard Analytics & Admin Tools Controller (Google Forms Minimalist Style)

// Global state variables
let questionDefs = {};
let analyticsData = {};
let submissionRecords = [];
let chartInstances = {};
let activeTab = "overview";
let activeQualitativeKeyword = null;

// Minimalist dual-color scheme: Aarambha Navy and Gold
const CHART_BAR_COLORS = [
    'rgba(0, 79, 149, 0.8)',  // Aarambha Navy
    'rgba(252, 163, 38, 0.8)',  // Aarambha Gold
    'rgba(0, 139, 196, 0.8)',  // Aarambha Sky Blue
    'rgba(95, 99, 104, 0.8)'   // Slate Grey
];

const CHART_BORDER_COLORS = [
    'rgb(0, 79, 149)',
    'rgb(252, 163, 38)',
    'rgb(0, 139, 196)',
    'rgb(95, 99, 104)'
];

document.addEventListener("DOMContentLoaded", () => {
    // Check if passcode already saved in session
    const savedPasscode = sessionStorage.getItem("adminPasscode");
    if (savedPasscode) {
        attemptAutoLogin(savedPasscode);
    }
});

// Passcode Submission Handler
async function handlePasscodeSubmit(e) {
    e.preventDefault();
    const inputField = document.getElementById("adminPasscodeField");
    const passcode = inputField.value.trim();

    if (!passcode) return;

    const success = await loadDashboardData(passcode);
    if (success) {
        sessionStorage.setItem("adminPasscode", passcode);
        document.getElementById("passcodeOverlay").style.display = "none";
        document.getElementById("dashboardMain").style.display = "flex";
        showToast("Authenticated successfully");
        renderDashboard();
    } else {
        showToast("Invalid administrator passcode.", true);
        inputField.value = "";
        inputField.focus();
    }
}

// Auto-Login bypass if passcode exists
async function attemptAutoLogin(passcode) {
    const success = await loadDashboardData(passcode);
    if (success) {
        document.getElementById("passcodeOverlay").style.display = "none";
        document.getElementById("dashboardMain").style.display = "flex";
        renderDashboard();
    } else {
        sessionStorage.removeItem("adminPasscode");
        document.getElementById("passcodeOverlay").style.display = "flex";
    }
}

// Logout & Lock
function handleLogout() {
    sessionStorage.removeItem("adminPasscode");
    window.location.reload();
}

// Load Dashboard Data from API
async function loadDashboardData(passcode, grade = null, section = null) {
    try {
        const headers = {
            "Content-Type": "application/json",
            "X-Admin-Passcode": passcode
        };

        let params = [];
        if (grade && grade !== "all") params.push(`grade=${grade}`);
        if (section && section.trim() !== "") params.push(`section=${encodeURIComponent(section.trim())}`);
        const queryStr = params.length > 0 ? "?" + params.join("&") : "";

        // Fetch Questions
        const qResponse = await fetch("/api/v1/questions");
        if (!qResponse.ok) throw new Error("Questions loading failed");
        questionDefs = await qResponse.json();

        // Fetch Analytics
        const aResponse = await fetch(`/api/v1/analytics${queryStr}`, { headers });
        if (aResponse.status === 401) return false;
        if (!aResponse.ok) throw new Error("Analytics loading failed");
        analyticsData = await aResponse.json();

        // Fetch Individual Submissions
        const sResponse = await fetch(`/api/v1/submissions${queryStr}`, { headers });
        if (!sResponse.ok) throw new Error("Submissions loading failed");
        submissionRecords = await sResponse.json();

        return true;
    } catch (error) {
        console.error("API Fetch Error:", error);
        showToast(error.message, true);
        return false;
    }
}

// Refresh Dashboard elements
function renderDashboard() {
    updateKPIs();
    
    if (activeTab === "overview") {
        renderQuantitativeCharts();
    } else if (activeTab === "qualitative") {
        renderQualitativePanels();
    } else if (activeTab === "submissions") {
        renderSubmissionsExplorer();
    } else if (activeTab === "questions") {
        renderQuestionManagement();
    }
}

// Filter Actions
async function applyFilters() {
    const passcode = sessionStorage.getItem("adminPasscode");
    if (!passcode) return;

    const grade = document.getElementById("filterGrade").value;
    const section = document.getElementById("filterSection").value;

    showToast("Applying classwise filters...");
    const success = await loadDashboardData(passcode, grade, section);
    if (success) {
        renderDashboard();
    } else {
        showToast("Filtering failed. Re-authenticating...", true);
        handleLogout();
    }
}

// Tab switcher
function switchDashboardTab(tabName) {
    activeTab = tabName;
    activeQualitativeKeyword = null; // Clear filter on tab change

    // Toggle Tab Buttons active state
    document.querySelectorAll(".dash-tab-btn").forEach(btn => {
        btn.classList.toggle("active", btn.id === `tabBtn-${tabName}`);
    });

    // Toggle panels visibility
    document.querySelectorAll(".tab-panel").forEach(panel => {
        panel.classList.toggle("active", panel.id === `panel-${tabName}`);
    });

    renderDashboard();
}

// Update KPI Metrics Cards (Emojis Removed)
function updateKPIs() {
    const totalSubmissions = analyticsData.total_submissions || 0;
    document.getElementById("kpiSubmissions").textContent = totalSubmissions;

    const buckets = analyticsData.qualitative?.sentiment_buckets || {};
    const confidentCount = buckets.Confident?.length || 0;
    const neutralCount = buckets.Neutral?.length || 0;
    const supportCount = buckets["Needs Support"]?.length || 0;
    
    const totalQual = confidentCount + neutralCount + supportCount;

    if (totalQual > 0) {
        document.getElementById("kpiConfident").textContent = `${Math.round((confidentCount / totalQual) * 100)}%`;
        document.getElementById("kpiNeutral").textContent = `${Math.round((neutralCount / totalQual) * 100)}%`;
        document.getElementById("kpiSupport").textContent = `${Math.round((supportCount / totalQual) * 100)}%`;
    } else {
        document.getElementById("kpiConfident").textContent = "0%";
        document.getElementById("kpiNeutral").textContent = "0%";
        document.getElementById("kpiSupport").textContent = "0%";
    }
}

// Render dynamic charts with minimalist Aarambha Orange & Slate Grey palette
function renderQuantitativeCharts() {
    const chartsGrid = document.getElementById("chartsGrid");
    const noDataMessage = document.getElementById("noDataMessage");
    
    chartsGrid.innerHTML = "";

    const totalSubmissions = analyticsData.total_submissions || 0;
    if (totalSubmissions === 0) {
        noDataMessage.style.display = "block";
        return;
    } else {
        noDataMessage.style.display = "none";
    }

    const dists = analyticsData.quantitative || {};

    const sortedQIds = Object.keys(questionDefs)
        .map(Number)
        .filter(qId => questionDefs[qId].type === "mcq" || questionDefs[qId].type === "checkbox")
        .sort((a, b) => a - b);

    sortedQIds.forEach(qId => {
        const qDef = questionDefs[qId];
        const qDist = dists[qId] || {};

        const chartCard = document.createElement("div");
        chartCard.className = "chart-card";

        const titleEl = document.createElement("h3");
        titleEl.textContent = `${qId}. ${qDef.text}`;
        titleEl.title = qDef.text;
        chartCard.appendChild(titleEl);

        const wrapper = document.createElement("div");
        wrapper.className = "chart-wrapper";
        const canvas = document.createElement("canvas");
        canvas.id = `chart-canvas-${qId}`;
        wrapper.appendChild(canvas);
        chartCard.appendChild(wrapper);

        chartsGrid.appendChild(chartCard);

        const labels = [];
        const dataValues = [];
        const backgroundColors = [];
        const borderColors = [];

        Object.keys(qDef.options).forEach((optKey, idx) => {
            const friendlyText = qDef.options[optKey];
            labels.push(`(${optKey.toUpperCase()}) ${truncateText(friendlyText, 25)}`);
            dataValues.push(qDist[optKey] || 0);

            // Cycle through dual-color aesthetic
            const colorIdx = idx % CHART_BAR_COLORS.length;
            backgroundColors.push(CHART_BAR_COLORS[colorIdx]);
            borderColors.push(CHART_BORDER_COLORS[colorIdx]);
        });

        if (chartInstances[qId]) {
            chartInstances[qId].destroy();
        }

        const ctx = canvas.getContext('2d');
        chartInstances[qId] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Responses',
                    data: dataValues,
                    backgroundColor: backgroundColors,
                    borderColor: borderColors,
                    borderWidth: 1,
                    borderRadius: 2, // Minimalist sharp corners
                    hoverBorderWidth: 1.5
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function(context) { return `Count: ${context.parsed.x}`; }
                        }
                    }
                },
                scales: {
                    x: {
                        beginAtZero: true,
                        ticks: {
                            stepSize: 1,
                            color: '#5F6368',
                            font: { family: 'Outfit', size: 12 }
                        },
                        grid: { color: '#E8EAED' }
                    },
                    y: {
                        ticks: {
                            color: '#202124',
                            font: { family: 'Outfit', size: 12, weight: '500' }
                        },
                        grid: { display: false }
                    }
                }
            }
        });
    });
}

// Render qualitative school intent panels (Problems, Leadership, Aspirations)
function renderQualitativePanels() {
    const qual = analyticsData.qualitative || {};
    
    // 1. Problems (Q15 focus)
    const probData = qual.problems || { keywords: { verbs: [], nouns: [] }, responses: [] };
    renderSpecializedCloud("problemCloud", probData.keywords);
    renderSpecializedFeed("problemFeed", probData.responses, "neutral"); // Use flat styling

    // 2. Leadership (Q16, 17, 20 focus)
    const leadData = qual.leadership || { keywords: { verbs: [], nouns: [] }, responses: [] };
    renderSpecializedCloud("leadershipCloud", leadData.keywords);
    renderSpecializedFeed("leadershipFeed", leadData.responses, "neutral");

    // 3. Student Aspirations (Q10, 25 focus)
    const aspData = qual.aspirations || { keywords: { verbs: [], nouns: [] }, responses: [] };
    renderSpecializedCloud("aspirationCloud", aspData.keywords);
    renderSpecializedFeed("aspirationFeed", aspData.responses, "neutral");
}

function renderSpecializedCloud(elementId, keywords) {
    const container = document.getElementById(elementId);
    if (!container) return;

    container.innerHTML = "";
    const verbs = keywords?.verbs || [];
    const nouns = keywords?.nouns || [];
    const combined = [...verbs.slice(0, 5), ...nouns.slice(0, 5)];

    if (combined.length === 0) {
        container.innerHTML = "<div class='empty-state' style='padding: 10px 0;'>No keywords extracted.</div>";
        return;
    }

    combined.forEach(item => {
        const isVerb = verbs.includes(item);
        const tag = document.createElement("span");
        tag.className = `tag ${isVerb ? 'tag-verb' : 'tag-noun'}`;
        if (activeQualitativeKeyword === item.word) {
            tag.classList.add('active');
        }
        tag.innerHTML = `${item.word} <span class='tag-count'>(${item.count})</span>`;
        
        tag.onclick = () => {
            if (activeQualitativeKeyword === item.word) {
                activeQualitativeKeyword = null; // Toggle off
            } else {
                activeQualitativeKeyword = item.word;
            }
            renderQualitativePanels();
        };

        container.appendChild(tag);
    });
}

function renderSpecializedFeed(elementId, responses, themeClass) {
    const container = document.getElementById(elementId);
    if (!container) return;

    container.innerHTML = "";
    
    let filteredResponses = responses;
    if (activeQualitativeKeyword) {
        filteredResponses = responses.filter(r => 
            r.response.toLowerCase().includes(activeQualitativeKeyword.toLowerCase())
        );
        
        const indicator = document.createElement("div");
        indicator.style.fontSize = "13px";
        indicator.style.fontWeight = "600";
        indicator.style.color = "var(--accent-color)";
        indicator.style.marginBottom = "10px";
        indicator.textContent = `Filtering by: "${activeQualitativeKeyword}" (${filteredResponses.length} results)`;
        container.appendChild(indicator);
    }

    if (!filteredResponses || filteredResponses.length === 0) {
        const noData = document.createElement("div");
        noData.className = "empty-state";
        noData.textContent = activeQualitativeKeyword ? "No student statements match this keyword." : "No student statements reported.";
        container.appendChild(noData);
        return;
    }

    filteredResponses.slice(0, 15).forEach(resp => {
        const item = document.createElement("div");
        item.className = "response-item"; // Clean flat item without large colored sidebars
        
        item.innerHTML = `
            <div class="response-meta">
                <span class="q-badge">Q${resp.question_id}</span>
                <span>Session: ${resp.session_id.substring(0, 8)}...</span>
            </div>
            <div class="response-body">"${resp.response}"</div>
        `;
        container.appendChild(item);
    });
}

// Render Submissions Explorer Table Grid
function renderSubmissionsExplorer() {
    const tableBody = document.getElementById("submissionsTableBody");
    const recordCountLabel = document.getElementById("submissionRecordCount");
    
    tableBody.innerHTML = "";
    recordCountLabel.textContent = `${submissionRecords.length} records found`;

    if (submissionRecords.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align: center;" class="empty-state">No submissions found matching criteria.</td>
            </tr>
        `;
        return;
    }

    submissionRecords.forEach((sub, idx) => {
        const tr = document.createElement("tr");
        
        let dateStr = sub.created_at;
        try {
            const d = new Date(sub.created_at);
            dateStr = d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } catch (e) {}

        tr.innerHTML = `
            <td style="font-weight: 500; color: var(--text-main);">${sub.student_name}</td>
            <td>Grade ${sub.student_grade}</td>
            <td style="text-transform: uppercase;">${sub.student_section}</td>
            <td>${dateStr}</td>
            <td>
                <button class="btn btn-secondary" onclick="openSubmissionModal(${idx})" style="padding: 5px 12px; font-size: 12px; border-radius: 4px;">
                    View Details
                </button>
            </td>
        `;
        tableBody.appendChild(tr);
    });
}

// Open details Modal for individual student responses
function openSubmissionModal(index) {
    const sub = submissionRecords[index];
    if (!sub) return;

    document.getElementById("detailStudentName").textContent = sub.student_name;
    document.getElementById("detailStudentGrade").textContent = `Grade ${sub.student_grade}`;
    document.getElementById("detailStudentSection").textContent = sub.student_section;
    
    let dateStr = sub.created_at;
    try {
        const d = new Date(sub.created_at);
        dateStr = d.toLocaleString();
    } catch(e) {}
    document.getElementById("detailStudentDate").textContent = dateStr;

    const listContainer = document.getElementById("modalDetailAnswersList");
    listContainer.innerHTML = "";

    const sortedQIds = Object.keys(questionDefs).map(Number).sort((a, b) => a - b);

    sortedQIds.forEach(qId => {
        const qDef = questionDefs[qId];
        const ansVal = sub.answers[qId] || "";

        const item = document.createElement("div");
        item.className = "detail-answer-item";

        let formattedAnswer = "";
        if (!ansVal) {
            formattedAnswer = "<span style='color: var(--text-muted); font-style: italic;'>No Answer Provided</span>";
        } else if (qDef.type === "mcq") {
            const optionText = qDef.options[ansVal.toLowerCase()];
            formattedAnswer = `<strong>(${ansVal.toUpperCase()})</strong> ${optionText || ansVal}`;
        } else if (qDef.type === "checkbox") {
            const letters = ansVal.split(",").map(s => s.trim().toLowerCase());
            const mappedText = letters.map(l => {
                const text = qDef.options[l];
                return `<strong>(${l.toUpperCase()})</strong> ${text || l}`;
            });
            formattedAnswer = mappedText.join(", ");
        } else {
            formattedAnswer = `<em>"${ansVal}"</em>`;
        }

        item.innerHTML = `
            <div class="detail-answer-q">${qId}. ${qDef.text}</div>
            <div class="detail-answer-a">${formattedAnswer}</div>
        `;
        listContainer.appendChild(item);
    });

    document.getElementById("submissionDetailModal").style.display = "flex";
}

// Close submissions detail overlay modal
function closeSubmissionModal() {
    document.getElementById("submissionDetailModal").style.display = "none";
}

// Render Manage Questions Tab panel list
function renderQuestionManagement() {
    const container = document.getElementById("questionsManageList");
    container.innerHTML = "";

    const sortedQIds = Object.keys(questionDefs).map(Number).sort((a, b) => a - b);

    sortedQIds.forEach(qId => {
        const q = questionDefs[qId];

        const item = document.createElement("div");
        item.className = "question-manage-item";

        item.innerHTML = `
            <div class="question-manage-info">
                <span class="question-manage-num">Q${q.id} (Section ${q.section})</span>
                <div class="question-manage-text">${q.text}</div>
                <div class="question-manage-type">Type: ${q.type.toUpperCase()} ${q.options ? '• choices: ' + Object.keys(q.options).join(', ').toUpperCase() : ''}</div>
            </div>
            <button class="btn btn-secondary" onclick="openEditQuestionModal(${q.id})" style="padding: 6px 14px; font-size: 13px; border-radius: 4px;">
                Edit Question
            </button>
        `;
        container.appendChild(item);
    });
}

// Edit Question Modal actions
function openEditQuestionModal(qId) {
    const q = questionDefs[qId];
    if (!q) return;

    document.getElementById("editQuestionId").value = q.id;
    document.getElementById("editModalTitle").textContent = `Edit Survey Question Q${q.id} (Section ${q.section})`;
    document.getElementById("editQuestionTextField").value = q.text;

    const optContainer = document.getElementById("editOptionsContainer");
    const optGrid = document.getElementById("editOptionsGrid");
    
    optGrid.innerHTML = "";

    if (q.type === "mcq" || q.type === "checkbox") {
        optContainer.style.display = "block";
        
        Object.keys(q.options).forEach(optKey => {
            const row = document.createElement("div");
            row.className = "option-edit-row";
            row.innerHTML = `
                <span class="option-edit-letter">${optKey}</span>
                <input type="text" class="option-edit-input" data-key="${optKey}" value="${q.options[optKey]}" required>
            `;
            optGrid.appendChild(row);
        });
    } else {
        optContainer.style.display = "none";
    }

    document.getElementById("questionEditModal").style.display = "flex";
}

function closeEditQuestionModal() {
    document.getElementById("questionEditModal").style.display = "none";
}

// Post edited survey question changes back to SQLite
async function submitQuestionEdit(e) {
    e.preventDefault();
    const passcode = sessionStorage.getItem("adminPasscode");
    if (!passcode) return;

    const qId = parseInt(document.getElementById("editQuestionId").value);
    const qText = document.getElementById("editQuestionTextField").value.trim();

    if (!qText) return;

    const payload = {
        question_text: qText,
        options: null
    };

    const optInputs = document.querySelectorAll(".option-edit-input");
    if (optInputs.length > 0) {
        payload.options = {};
        optInputs.forEach(input => {
            const key = input.getAttribute("data-key");
            payload.options[key] = input.value.trim();
        });
    }

    const btnSave = document.getElementById("btnSaveQuestionEdit");
    btnSave.disabled = true;
    btnSave.textContent = "Saving...";

    try {
        const response = await fetch(`/api/v1/questions/${qId}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                "X-Admin-Passcode": passcode
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.detail || "Failed to update question");
        }

        showToast(`Survey Question Q${qId} successfully updated`);
        closeEditQuestionModal();
        
        // Refresh dashboard data instantly
        const grade = document.getElementById("filterGrade").value;
        const section = document.getElementById("filterSection").value;
        await loadDashboardData(passcode, grade, section);
        renderDashboard();

    } catch(error) {
        console.error("Edit Question Error:", error);
        showToast("Error updating question: " + error.message, true);
    } finally {
        btnSave.disabled = false;
        btnSave.textContent = "Save Changes";
    }
}

// Helpers
function truncateText(str, n) {
    return (str.length > n) ? str.substr(0, n - 1) + '...' : str;
}

function showToast(message, isError = false) {
    const toast = document.getElementById("toast");
    if (!toast) return;
    toast.textContent = message;
    toast.className = "toast";
    if (isError) toast.classList.add("error");
    toast.classList.add("show");

    setTimeout(() => {
        toast.classList.remove("show");
    }, 3000);
}
