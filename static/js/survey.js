// Survey SPA Dynamic Layout State Engine

document.addEventListener("DOMContentLoaded", () => {
    // State variables
    let sessionId = null;
    let studentProfile = {};
    let questionDefs = {};
    let currentStepIndex = 0; // 0: Welcome, 1: A, 2: B, 3: C, 4: D, 5: E, 6: Thanks
    const steps = ["welcome", "A", "B", "C", "D", "E", "thanks"];
    const sectionNames = {
        "A": "Section A: How I See Myself",
        "B": "Section B: What I Hear",
        "C": "Section C: How I Feel",
        "D": "Section D: Leadership Roles",
        "E": "Section E: My Future"
    };
    const sectionInfo = {
        "A": { title: "Section A — How I See Myself in Class", desc: "Let's reflect on your own role and confidence during our class activities." },
        "B": { title: "Section B — What I Hear in the Classroom", desc: "Let's reflect on the messages and feedback you receive from teachers and classmates." },
        "C": { title: "Section C — How I Feel in Class Right Now", desc: "Let's check in on your emotional space, safety, and happiness in class." },
        "D": { title: "Section D — Classroom Leadership Roles", desc: "Let's look at opportunities for student leadership, ownership, and equity in class." },
        "E": { title: "Section E — My Future in the Classroom", desc: "Finally, look forward to who you want to become and how we can help you get there." }
    };

    // DOM Elements
    const btnStartSurvey = document.getElementById("btnStartSurvey");
    const welcomeView = document.getElementById("welcomeView");
    const surveyForm = document.getElementById("surveyForm");
    const questionsContainer = document.getElementById("questionsContainer");
    const progressContainer = document.getElementById("progressContainer");
    const progressFill = document.getElementById("progressFill");
    const sectionTitleIndicator = document.getElementById("sectionTitleIndicator");
    const btnPrev = document.getElementById("btnPrev");
    const btnNext = document.getElementById("btnNext");
    const btnSubmit = document.getElementById("btnSubmit");
    const thanksView = document.getElementById("thanksView");
    const displaySessionId = document.getElementById("displaySessionId");
    
    // Summary nodes
    const sumName = document.getElementById("sumName");
    const sumGrade = document.getElementById("sumGrade");
    const sumSection = document.getElementById("sumSection");
    const toast = document.getElementById("toast");

    // Pre-fetch question definitions on load
    prefetchQuestions();

    async function prefetchQuestions() {
        try {
            const response = await fetch("/api/v1/questions");
            if (!response.ok) throw new Error("Failed to load questions");
            questionDefs = await response.json();
            console.log("Questions Loaded Successfully from Database:", Object.keys(questionDefs).length);
        } catch (error) {
            console.error("Error prefetching questions:", error);
            showToast("Failed to connect to survey backend. Please check connection.", true);
        }
    }

    // Start survey button click (Validates student details and registers session)
    if (btnStartSurvey) {
        btnStartSurvey.addEventListener("click", async () => {
            const nameInput = document.getElementById("studentName");
            const gradeInput = document.getElementById("studentGrade");
            const sectionInput = document.getElementById("studentSection");

            const name = nameInput.value.trim();
            const grade = gradeInput.value;
            const section = sectionInput.value.trim().toUpperCase();

            // Validate fields
            if (!name) {
                showToast("Please enter your Name.", true);
                nameInput.focus();
                return;
            }
            if (!grade) {
                showToast("Please select your Grade.", true);
                gradeInput.focus();
                return;
            }
            if (!section) {
                showToast("Please enter your Section.", true);
                sectionInput.focus();
                return;
            }

            btnStartSurvey.disabled = true;
            btnStartSurvey.textContent = "Loading...";

            studentProfile = { name, grade: parseInt(grade), section };

            try {
                // Initialize session in SQLite
                const response = await fetch("/api/v1/sessions", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        student_name: studentProfile.name,
                        student_grade: studentProfile.grade,
                        student_section: studentProfile.section
                    })
                });

                if (!response.ok) throw new Error("Could not initialize student session");

                const sessionData = await response.json();
                sessionId = sessionData.session_id;

                // Dynamically compile survey questions layout if not already built
                if (questionsContainer.children.length === 0) {
                    compileSurveyQuestions();
                }

                // Clear welcome & show Section A
                goToStep(1);

            } catch (error) {
                console.error("Session Registration Error:", error);
                showToast("Failed to register survey. Please check connection.", true);
                btnStartSurvey.disabled = false;
                btnStartSurvey.textContent = "Start Survey";
            }
        });
    }

    // Dynamic HTML compilation for DB-served questions
    function compileSurveyQuestions() {
        if (!questionsContainer) return;
        questionsContainer.innerHTML = "";

        // Sort question IDs numerically
        const sortedQIds = Object.keys(questionDefs).map(Number).sort((a, b) => a - b);

        // Group question defs by Section letter (A, B, C, D, E)
        const sections = { "A": [], "B": [], "C": [], "D": [], "E": [] };
        sortedQIds.forEach(id => {
            const q = questionDefs[id];
            if (sections[q.section]) {
                sections[q.section].push(q);
            }
        });

        // Compile HTML structures
        Object.keys(sections).forEach(secLetter => {
            const secQuestions = sections[secLetter];
            const info = sectionInfo[secLetter];

            const secDiv = document.createElement("div");
            secDiv.className = "view";
            secDiv.id = `view-${secLetter}`;

            let questionsHTML = `
                <div class="section-header">
                    <h2>${info.title}</h2>
                    <p class="section-desc">${info.desc}</p>
                </div>
            `;

            secQuestions.forEach(q => {
                questionsHTML += `
                    <div class="form-group" id="group-q${q.id}">
                        <label class="question-label">
                            ${q.id}. ${q.text}
                            ${q.type === 'checkbox' ? '<span class="instruction-span">(Choose all that apply)</span>' : ''}
                        </label>
                `;

                if (q.type === "mcq") {
                    questionsHTML += `<div class="radio-group">`;
                    Object.keys(q.options).forEach((optKey, idx) => {
                        const optText = q.options[optKey];
                        questionsHTML += `
                            <label class="option-container">
                                <input type="radio" name="q${q.id}" value="${optKey}" ${idx === 0 ? 'required' : ''}>
                                <span class="custom-radio"></span>
                                <span class="option-text"><strong>${optKey})</strong> ${optText}</span>
                            </label>
                        `;
                    });
                    questionsHTML += `</div>`;
                } else if (q.type === "checkbox") {
                    questionsHTML += `<div class="checkbox-group">`;
                    Object.keys(q.options).forEach(optKey => {
                        const optText = q.options[optKey];
                        questionsHTML += `
                            <label class="option-container">
                                <input type="checkbox" name="q${q.id}" value="${optKey}">
                                <span class="custom-checkbox"></span>
                                <span class="option-text"><strong>${optKey})</strong> ${optText}</span>
                            </label>
                        `;
                    });
                    questionsHTML += `</div>`;
                } else if (q.type === "open") {
                    questionsHTML += `
                        <textarea id="q${q.id}" name="q${q.id}" rows="4" 
                            placeholder="Write your honest thoughts here..." required></textarea>
                    `;
                }

                questionsHTML += `</div>`; // Close form-group
            });

            secDiv.innerHTML = questionsHTML;
            questionsContainer.appendChild(secDiv);
        });
    }

    // Navigation buttons
    if (btnPrev) {
        btnPrev.addEventListener("click", () => {
            if (currentStepIndex > 0) {
                goToStep(currentStepIndex - 1);
            }
        });
    }

    if (btnNext) {
        btnNext.addEventListener("click", () => {
            if (validateSection(steps[currentStepIndex])) {
                if (currentStepIndex < 5) {
                    goToStep(currentStepIndex + 1);
                }
            }
        });
    }

    if (btnSubmit) {
        btnSubmit.addEventListener("click", async () => {
            if (validateSection("E")) {
                await submitSurveyData();
            }
        });
    }

    // Core step transition function
    function goToStep(stepIndex) {
        const views = document.querySelectorAll(".view");
        views.forEach(v => {
            v.classList.remove("active");
            v.style.display = "none";
        });

        currentStepIndex = stepIndex;
        const currentStepName = steps[currentStepIndex];

        if (currentStepName === "welcome") {
            welcomeView.style.display = "block";
            setTimeout(() => welcomeView.classList.add("active"), 50);
            progressContainer.style.display = "none";
            surveyForm.style.display = "none";
            
            // Re-enable Start Survey button if returning to edit
            if (btnStartSurvey) {
                btnStartSurvey.disabled = false;
                btnStartSurvey.textContent = "Update & Continue";
            }
        } else if (currentStepName === "thanks") {
            thanksView.style.display = "block";
            setTimeout(() => thanksView.classList.add("active"), 50);
            progressContainer.style.display = "none";
            surveyForm.style.display = "none";

            // Update registered details in summary cards
            if (displaySessionId) displaySessionId.textContent = sessionId;
            if (sumName) sumName.textContent = studentProfile.name;
            if (sumGrade) sumGrade.textContent = `Grade ${studentProfile.grade}`;
            if (sumSection) sumSection.textContent = studentProfile.section;
        } else {
            surveyForm.style.display = "block";
            progressContainer.style.display = "flex";
            
            const targetView = document.getElementById(`view-${currentStepName}`);
            if (targetView) {
                targetView.style.display = "block";
                setTimeout(() => targetView.classList.add("active"), 50);
            }

            updateProgressBar(currentStepName);

            btnPrev.style.display = "inline-flex";
            
            if (currentStepName === "E") {
                btnNext.style.display = "none";
                btnSubmit.style.display = "inline-flex";
            } else {
                btnNext.style.display = "inline-flex";
                btnSubmit.style.display = "none";
            }
        }

        document.getElementById("surveyCard").scrollIntoView({ behavior: "smooth", block: "start" });
    }

    // Update the progress visual elements
    function updateProgressBar(sectionLetter) {
        const letters = ["A", "B", "C", "D", "E"];
        const index = letters.indexOf(sectionLetter);
        
        const progressPct = ((index + 1) / letters.length) * 100;
        progressFill.style.width = `${progressPct}%`;

        letters.forEach((l, idx) => {
            const el = document.getElementById(`step-${l}`);
            if (el) {
                el.classList.remove("active", "completed");
                if (idx < index) {
                    el.classList.add("completed");
                } else if (idx === index) {
                    el.classList.add("active");
                }
            }
        });

        sectionTitleIndicator.textContent = sectionNames[sectionLetter];
    }

    // Validate active survey section input values
    function validateSection(sectionLetter) {
        const view = document.getElementById(`view-${sectionLetter}`);
        if (!view) return true;

        let isValid = true;
        const formGroups = view.querySelectorAll(".form-group");

        formGroups.forEach(group => {
            const radios = group.querySelectorAll('input[type="radio"]');
            const textareas = group.querySelectorAll('textarea');

            let groupValid = true;

            // Validate MCQ radios (at least one must be checked since we mark the first as required)
            if (radios.length > 0) {
                const checked = Array.from(radios).some(r => r.checked);
                if (!checked) {
                    groupValid = false;
                }
            }

            // Validate Open Ended textareas
            if (textareas.length > 0) {
                textareas.forEach(textarea => {
                    if (textarea.hasAttribute("required") && textarea.value.trim() === "") {
                        groupValid = false;
                        textarea.classList.add("invalid");
                    } else {
                        textarea.classList.remove("invalid");
                    }
                });
            }

            if (!groupValid) {
                isValid = false;
                group.classList.add("group-error");
            } else {
                group.classList.remove("group-error");
            }
        });

        if (!isValid) {
            showToast("Please answer all required questions in this section.", true);
        }

        return isValid;
    }

    // Clear error highlights when user interacts
    document.addEventListener("input", (e) => {
        if (e.target.tagName === "TEXTAREA" || e.target.type === "radio") {
            const group = e.target.closest(".form-group");
            if (group) {
                group.classList.remove("group-error");
            }
            if (e.target.tagName === "TEXTAREA") {
                e.target.classList.remove("invalid");
            }
        }
    });

    // Submit complete answers bundle to FastAPI
    async function submitSurveyData() {
        if (!sessionId) {
            showToast("Session connection lost. Please reload.", true);
            return;
        }

        btnSubmit.disabled = true;
        btnSubmit.textContent = "Submitting...";

        const formData = new FormData(surveyForm);
        const answers = {};

        // Loop through keys of pre-fetched definitions
        Object.keys(questionDefs).forEach(qIdStr => {
            const qId = parseInt(qIdStr);
            const q = questionDefs[qId];
            
            if (q.type === "mcq") {
                const val = formData.get(`q${qId}`);
                answers[qId] = val || "";
            } else if (q.type === "checkbox") {
                const vals = formData.getAll(`q${qId}`);
                answers[qId] = vals.join(","); // Comma-separated list
            } else if (q.type === "open") {
                const val = formData.get(`q${qId}`);
                answers[qId] = val ? val.trim() : "";
            }
        });

        try {
            const response = await fetch("/api/v1/responses/submit", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    session_id: sessionId,
                    answers: answers
                })
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.detail || "Submission failed");
            }

            goToStep(6); // Show thanks View

        } catch (error) {
            console.error("Submission Error:", error);
            showToast(error.message || "Failed to submit survey. Please try again.", true);
            btnSubmit.disabled = false;
            btnSubmit.textContent = "Submit Survey ✓";
        }
    }

    // Show toast notifications
    function showToast(message, isError = false) {
        if (!toast) return;
        toast.textContent = message;
        toast.className = "toast";
        if (isError) toast.classList.add("error");
        toast.classList.add("show");

        setTimeout(() => {
            toast.classList.remove("show");
        }, 3500);
    }
});
