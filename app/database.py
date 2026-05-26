import sqlite3
import os
import json
from datetime import datetime

DB_PATH = os.environ.get("DB_PATH", os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "survey.db"))

DEFAULT_QUESTIONS = [
    # Section A
    (1, "A", "Which best describes your usual role during classroom group work?", "mcq", 
     json.dumps({"a": "I usually take charge and guide the group", "b": "I share ideas but let others lead", "c": "I follow what the group decides", "d": "It depends on the subject or activity"})),
    (2, "A", "I feel confident speaking up and sharing my ideas during class discussions.", "mcq", 
     json.dumps({"a": "Strongly Agree", "b": "Agree", "c": "Neutral", "d": "Disagree", "e": "Strongly Disagree"})),
    (3, "A", "Which words describe how you see yourself in class? (Choose all that apply)", "checkbox", 
     json.dumps({"a": "A natural leader", "b": "A creative thinker", "c": "A problem solver", "d": "A hard worker", "e": "Still growing"})),
    (4, "A", "How would you describe your role in your classroom? What do you contribute most?", "open", None),
    (5, "A", "Describe a moment in class when you took initiative or helped your group. What happened?", "open", None),
    
    # Section B
    (6, "B", "What does your teacher most often say about your class participation?", "mcq", 
     json.dumps({"a": "They praise me for contributing and leading", "b": "They encourage me to participate more often", "c": "They say I am helpful to my classmates", "d": "They rarely give me specific feedback"})),
    (7, "B", "My teacher's feedback helps me grow as a learner and leader in class.", "mcq", 
     json.dumps({"a": "Strongly Agree", "b": "Agree", "c": "Neutral", "d": "Disagree", "e": "Strongly Disagree"})),
    (8, "B", "Has your teacher pointed out your leadership qualities during a classroom activity?", "mcq", 
     json.dumps({"a": "Yes, often", "b": "Sometimes", "c": "Not really"})),
    (9, "B", "What is the most encouraging thing your teacher has said about you in class? How did it affect you?", "open", None),
    (10, "B", "What do you wish your teacher or classmates would notice or say about you more often?", "open", None),
    
    # Section C
    (11, "C", "How do you usually feel when classroom activities or group work begin?", "mcq", 
     json.dumps({"a": "Ready and excited to take part", "b": "Okay-nothing special", "c": "A bit nervous or unsure", "d": "It really depends on the activity"})),
    (12, "C", "I feel safe to make mistakes and try new things in my classroom.", "mcq", 
     json.dumps({"a": "Strongly Agree", "b": "Agree", "c": "Neutral", "d": "Disagree", "e": "Strongly Disagree"})),
    (13, "C", "How happy are you in your classroom overall right now?", "mcq", 
     json.dumps({"a": "Very happy", "b": "Happy", "c": "Okay", "d": "Unhappy", "e": "Not happy"})),
    (14, "C", "What does your classroom do well that makes you feel supported as a learner and leader?", "open", None),
    (15, "C", "Is there anything about your classroom that makes you feel less confident? What would help?", "open", None),
    
    # Section D
    (16, "D", "Have you ever held a classroom leadership role?", "mcq", 
     json.dumps({"a": "Yes, I currently have one", "b": "Yes, I have had one before", "c": "No, but I would like one", "d": "No, and I'm not sure it interests me"})),
    (17, "D", "Which classroom leadership qualities do you already show? (Choose all that apply)", "checkbox", 
     json.dumps({
         "a": "I help classmates who don’t understand", 
         "b": "I suggest ideas in group work", 
         "c": "I make sure everyone has a turn", 
         "d": "I remind my group what we are supposed to do", 
         "e": "I help tidy up or set up without being asked", 
         "f": "I keep trying even when work is very hard", 
         "g": "I stay calm when things go wrong"
     })),
    (18, "D", "My classroom gives every student a fair chance to be a leader, not just the same few people.", "mcq", 
     json.dumps({"a": "Strongly Agree", "b": "Agree", "c": "Neutral", "d": "Disagree", "e": "Strongly Disagree"})),
    (19, "D", "Describe a time you led your group through a challenge in class. What did you do and what did you learn?", "open", None),
    (20, "D", "If you were given a leadership role in your class, what would you do to make your classroom better?", "open", None),
    
    # Section E
    (21, "E", "When you imagine yourself in a future class, how do you see yourself?", "mcq", 
     json.dumps({"a": "As a confident leader, others look up to", "b": "As someone more willing to speak up", "c": "Pretty much the same as I am now", "d": "I'm not sure-I'm still figuring it out"})),
    (22, "E", "I believe I can grow into a stronger classroom leader over the year.", "mcq", 
     json.dumps({"a": "Strongly Agree", "b": "Agree", "c": "Neutral", "d": "Disagree", "e": "Strongly Disagree"})),
    (23, "E", "Do you feel that classroom activities are preparing you to be a better leader in the future?", "mcq", 
     json.dumps({"a": "Yes, often", "b": "Sometimes", "c": "Not really"})),
    (24, "E", "What kind of classroom leader do you hope to be by the end of the year? What will you do differently?", "open", None),
    (25, "E", "Is there anything you would like your teacher to know about how you feel in class, or what would help you thrive?", "open", None)
]

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Create questions table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS questions (
            id INTEGER PRIMARY KEY,
            section TEXT NOT NULL,
            question_text TEXT NOT NULL,
            question_type TEXT NOT NULL,
            options TEXT -- JSON string of choices
        );
    """)

    # Create sessions table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS sessions (
            session_id TEXT PRIMARY KEY,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            completed INTEGER DEFAULT 0,
            student_name TEXT,
            student_grade INTEGER,
            student_section TEXT
        );
    """)
    
    # Create responses table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS responses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT,
            question_id INTEGER,
            answer_text TEXT,
            FOREIGN KEY (session_id) REFERENCES sessions (session_id) ON DELETE CASCADE,
            FOREIGN KEY (question_id) REFERENCES questions (id) ON DELETE CASCADE
        );
    """)
    
    conn.commit()

    # Pre-seed initial 25 questions if empty
    cursor.execute("SELECT COUNT(*) FROM questions")
    count = cursor.fetchone()[0]
    if count == 0:
        print("Pre-seeding default 25 questions into database...")
        cursor.executemany(
            "INSERT INTO questions (id, section, question_text, question_type, options) VALUES (?, ?, ?, ?, ?)",
            DEFAULT_QUESTIONS
        )
        conn.commit()

    conn.close()

def create_session(session_id: str, student_name: str, student_grade: int, student_section: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            """INSERT OR REPLACE INTO sessions 
               (session_id, created_at, completed, student_name, student_grade, student_section) 
               VALUES (?, ?, 0, ?, ?, ?)""",
            (session_id, datetime.utcnow().isoformat(), student_name, student_grade, student_section)
        )
        conn.commit()
    finally:
        conn.close()

def complete_session(session_id: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "UPDATE sessions SET completed = 1 WHERE session_id = ?",
            (session_id,)
        )
        conn.commit()
    finally:
        conn.close()

def save_response(session_id: str, question_id: int, answer_text: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "SELECT id FROM responses WHERE session_id = ? AND question_id = ?",
            (session_id, question_id)
        )
        row = cursor.fetchone()
        if row:
            cursor.execute(
                "UPDATE responses SET answer_text = ? WHERE id = ?",
                (answer_text, row['id'])
            )
        else:
            cursor.execute(
                "INSERT INTO responses (session_id, question_id, answer_text) VALUES (?, ?, ?)",
                (session_id, question_id, answer_text)
            )
        conn.commit()
    finally:
        conn.close()

def get_questions_from_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT id, section, question_text, question_type, options FROM questions ORDER BY id")
        rows = cursor.fetchall()
        result = {}
        for row in rows:
            opt_str = row['options']
            result[row['id']] = {
                "id": row['id'],
                "section": row['section'],
                "text": row['question_text'],
                "type": row['question_type'],
                "options": json.loads(opt_str) if opt_str else None
            }
        return result
    finally:
        conn.close()

def update_question_in_db(q_id: int, text: str, options: dict = None):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        opt_str = json.dumps(options) if options else None
        cursor.execute(
            "UPDATE questions SET question_text = ?, options = ? WHERE id = ?",
            (text, opt_str, q_id)
        )
        conn.commit()
    finally:
        conn.close()

def get_completed_sessions_count(grade: int = None, section: str = None) -> int:
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        query = "SELECT COUNT(*) FROM sessions WHERE completed = 1"
        params = []
        if grade is not None:
            query += " AND student_grade = ?"
            params.append(grade)
        if section is not None and section.strip() != "":
            query += " AND UPPER(student_section) = UPPER(?)"
            params.append(section.strip())
            
        cursor.execute(query, params)
        return cursor.fetchone()[0]
    finally:
        conn.close()

def get_all_completed_responses(grade: int = None, section: str = None):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        query = """
            SELECT r.question_id, r.answer_text, r.session_id
            FROM responses r
            JOIN sessions s ON r.session_id = s.session_id
            WHERE s.completed = 1
        """
        params = []
        if grade is not None:
            query += " AND s.student_grade = ?"
            params.append(grade)
        if section is not None and section.strip() != "":
            query += " AND UPPER(s.student_section) = UPPER(?)"
            params.append(section.strip())
            
        cursor.execute(query, params)
        rows = cursor.fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()

def get_detailed_submissions(grade: int = None, section: str = None):
    """
    Returns lists of all submissions with Name, Grade, Section, Date,
    and their mapped question responses.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        query = """
            SELECT session_id, created_at, student_name, student_grade, student_section
            FROM sessions
            WHERE completed = 1
        """
        params = []
        if grade is not None:
            query += " AND student_grade = ?"
            params.append(grade)
        if section is not None and section.strip() != "":
            query += " AND UPPER(student_section) = UPPER(?)"
            params.append(section.strip())
            
        query += " ORDER BY created_at DESC"
        
        cursor.execute(query, params)
        sessions_rows = cursor.fetchall()
        
        submissions = []
        for s_row in sessions_rows:
            s_id = s_row['session_id']
            cursor.execute("""
                SELECT question_id, answer_text 
                FROM responses 
                WHERE session_id = ?
            """, (s_id,))
            resp_rows = cursor.fetchall()
            
            answers = {r['question_id']: r['answer_text'] for r in resp_rows}
            submissions.append({
                "session_id": s_id,
                "created_at": s_row['created_at'],
                "student_name": s_row['student_name'],
                "student_grade": s_row['student_grade'],
                "student_section": s_row['student_section'],
                "answers": answers
            })
            
        return submissions
    finally:
        conn.close()
