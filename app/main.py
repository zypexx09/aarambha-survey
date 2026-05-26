import os
import uuid
from fastapi import FastAPI, HTTPException, Header, Depends, Query
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from typing import Dict, Any, List, Optional

from app.database import (
    init_db,
    create_session,
    complete_session,
    save_response,
    get_questions_from_db,
    update_question_in_db,
    get_completed_sessions_count,
    get_all_completed_responses,
    get_detailed_submissions
)
from app.analysis import (
    analyze_quantitative,
    analyze_qualitative
)

app = FastAPI(
    title="Student Voice Survey & Analytics API",
    description="Backend API for non-anonymous student survey data collection and NLP qualitative analysis",
    version="2.0.0"
)

# Admin passcode for security overlay (Zero-configuration secret)
ADMIN_PASSCODE = "admin123"

# Initialize database on startup
@app.on_event("startup")
def startup_db():
    init_db()

# Pydantic schemas
class SessionCreateRequest(BaseModel):
    student_name: str = Field(..., min_length=1, description="Student's full name")
    student_grade: int = Field(..., ge=4, le=8, description="Student's grade (4 to 8)")
    student_section: str = Field(..., min_length=1, description="Student's classroom section")

class SessionCreateResponse(BaseModel):
    session_id: str
    message: str

class SubmitSurveyRequest(BaseModel):
    session_id: str
    answers: Dict[int, str]

class SubmitResponse(BaseModel):
    success: bool
    message: str

class QuestionUpdateRequest(BaseModel):
    question_text: str = Field(..., min_length=1)
    options: Optional[Dict[str, str]] = None

# Admin passcode validation dependency
def verify_admin_passcode(x_admin_passcode: Optional[str] = Header(None)):
    if not x_admin_passcode or x_admin_passcode != ADMIN_PASSCODE:
        raise HTTPException(
            status_code=401,
            detail="Unauthorized admin access. Invalid or missing passcode."
        )
    return x_admin_passcode

@app.post("/api/v1/sessions", response_model=SessionCreateResponse)
async def start_new_session(data: SessionCreateRequest):
    """
    Generate an anonymous session UUID for a profiled student.
    """
    new_uuid = str(uuid.uuid4())
    create_session(
        new_uuid, 
        data.student_name.strip(), 
        data.student_grade, 
        data.student_section.strip().upper()
    )
    return SessionCreateResponse(session_id=new_uuid, message="Student session registered successfully")

@app.post("/api/v1/responses/submit", response_model=SubmitResponse)
async def submit_survey(data: SubmitSurveyRequest):
    """
    Submits survey responses for a session and marks it as completed.
    """
    session_id = data.session_id
    answers = data.answers
    
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id is required")
        
    question_defs = get_questions_from_db()
    
    # Save each response
    for q_id_str, ans_text in answers.items():
        try:
            q_id = int(q_id_str)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid question ID: {q_id_str}")
            
        if q_id not in question_defs:
            raise HTTPException(status_code=400, detail=f"Question ID {q_id} does not exist in DB")
            
        save_response(session_id, q_id, ans_text)
        
    # Mark the session as completed
    complete_session(session_id)
    
    return SubmitResponse(success=True, message="Survey submitted successfully")

@app.get("/api/v1/questions")
async def get_questions():
    """
    Retrieve survey question definitions from SQLite.
    """
    return get_questions_from_db()

@app.put("/api/v1/questions/{id}")
async def update_question(
    id: int, 
    data: QuestionUpdateRequest, 
    passcode: str = Depends(verify_admin_passcode)
):
    """
    Updates a question text and option list in database. Requires admin authentication.
    """
    question_defs = get_questions_from_db()
    if id not in question_defs:
        raise HTTPException(status_code=404, detail="Question not found")
        
    # Ensure options structure is preserved if MCQ
    q_type = question_defs[id]["type"]
    if q_type in ("mcq", "checkbox") and not data.options:
        raise HTTPException(status_code=400, detail="MCQ/Checkbox questions require an options dictionary")
        
    update_question_in_db(id, data.question_text.strip(), data.options)
    return {"success": True, "message": f"Question {id} updated successfully"}

@app.get("/api/v1/analytics")
async def get_analytics(
    grade: Optional[int] = Query(None, ge=4, le=8),
    section: Optional[str] = Query(None),
    passcode: str = Depends(verify_admin_passcode)
):
    """
    Computes classwise quantitative and qualitative NLP metrics. Requires admin passcode.
    """
    question_defs = get_questions_from_db()
    total_submissions = get_completed_sessions_count(grade, section)
    responses = get_all_completed_responses(grade, section)
    
    # Run analysis
    quantitative = analyze_quantitative(responses, question_defs)
    qualitative = analyze_qualitative(responses, question_defs)
    
    return {
        "total_submissions": total_submissions,
        "quantitative": quantitative,
        "qualitative": qualitative
    }

@app.get("/api/v1/submissions")
async def get_submissions(
    grade: Optional[int] = Query(None, ge=4, le=8),
    section: Optional[str] = Query(None),
    passcode: str = Depends(verify_admin_passcode)
):
    """
    Retrieve individual student response submissions. Requires admin passcode.
    """
    return get_detailed_submissions(grade, section)

# SPA routing - serve static HTML pages at root endpoints
STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "static")

@app.get("/", response_class=HTMLResponse)
async def serve_index():
    index_path = os.path.join(STATIC_DIR, "index.html")
    if not os.path.exists(index_path):
        raise HTTPException(status_code=404, detail="Frontend survey page not found")
    with open(index_path, "r", encoding="utf-8") as f:
        return HTMLResponse(content=f.read(), status_code=200)

@app.get("/dashboard", response_class=HTMLResponse)
async def serve_dashboard():
    dash_path = os.path.join(STATIC_DIR, "dashboard.html")
    if not os.path.exists(dash_path):
        raise HTTPException(status_code=404, detail="Dashboard page not found")
    with open(dash_path, "r", encoding="utf-8") as f:
        return HTMLResponse(content=f.read(), status_code=200)

# Mount remaining static directory for css, js, images
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
