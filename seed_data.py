import os
import sqlite3
import random
import uuid
import sys
from datetime import datetime, timedelta
from app.database import init_db, DB_PATH, get_questions_from_db

# Custom student details for realistic multi-grade profiling
MOCK_STUDENTS = [
    ("Aarav Sharma", 4, "A"),
    ("Sita Thapa", 4, "B"),
    ("Rohan Gurung", 5, "Lotus"),
    ("Preeti Adhikari", 5, "Rose"),
    ("David Miller", 6, "A"),
    ("Emma Watson", 6, "B"),
    ("Alex Carter", 6, "A"),
    ("Sneha Shrestha", 7, "Lotus"),
    ("Binod Bhattarai", 7, "Lotus"),
    ("Maya Angelou", 8, "Vibrant"),
    ("Kevin Hart", 8, "Lotus"),
    ("Sarah Connor", 8, "Rose"),
    ("James Bond", 5, "Lotus"),
    ("Elena Gilbert", 7, "Rose"),
    ("Peter Parker", 4, "A"),
    ("Harry Potter", 8, "Vibrant")
]

MOCK_FEEDBACK = {
    "confident": [
        "I felt happy to guide the team when the teacher asked us to build a bridge. We worked hard and shared ideas, solving it together easily.",
        "I lead the class group work very often and make sure everyone has a turn to speak. I feel proud of how I help others learn.",
        "I take initiative and suggest creative ideas during our class projects. Helping my classmates is very exciting for me.",
        "When my group got stuck on the math problem, I stepped up and explained the solution. I feel confident and enjoy guiding people.",
        "I helped tidy up the science materials and made sure our project finished on time. I like to contribute and be a helpful leader.",
        "I hope to be a strong leader who helps people. I will listen to suggestions and make sure everyone is participating.",
        "Our classroom does a fantastic job of encouraging us to speak. I feel safe and happy showing initiative during debates."
    ],
    "needs_support": [
        "I get very nervous and unsure when the teacher asks us to work in a group. I feel lost and afraid of making mistakes, which makes it hard.",
        "I struggle to speak up during class discussions because I am worried I will say the wrong thing. I wish my classmates would include me.",
        "I feel confused and less confident when the work gets difficult. Sometimes I stay quiet and try to hide because I am struggling.",
        "My teacher rarely gives me feedback, which makes me feel ignored. I wish someone would notice when I am trying my hardest.",
        "I stay quiet when others shout. I get nervous and anxious when things go wrong, and it is difficult for me to recover.",
        "I feel sad and left out during group assignments because the same few people always take over and don't listen to me.",
        "I want my teacher to know that I am struggling with the reading lessons. I need extra help and more time to finish my work."
    ],
    "neutral": [
        "We did some worksheets on fractions in groups. I helped write down the answers on the paper and tidied up the tables afterwards.",
        "Our teacher told us to read the textbook and then discuss with our table partner. We spent ten minutes talking about the character.",
        "I usually follow what my classmates say. Yesterday we built a poster using markers and cardboard for our science presentation.",
        "During classroom work, I sit at my desk and write down notes while the teacher explains the task on the blackboard.",
        "I tidied up the books on the shelf after reading time. The teacher asked me to do it and I completed the job.",
        "I will try to complete all my homework on time. I hope to keep doing the same things as I am doing now.",
        "We usually have spelling quizzes on Fridays. Sometimes we mark each other's papers and give them back."
    ]
}

def seed():
    # Force schema migrations by deleting existing sqlite file in dev environment
    if os.path.exists(DB_PATH):
        print("Wiping old SQLite database file to force schema migration...")
        try:
            os.remove(DB_PATH)
        except Exception as e:
            print(f"Warning: Could not remove old db file: {e}")

    print("Initializing Database & Questions Schema...")
    init_db()  # Creates questions table and pre-seeds initial 25 default questions
    
    question_defs = get_questions_from_db()
    if not question_defs:
        print("Error: Questions could not be loaded or database init failed.", file=sys.stderr)
        return

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    print(f"Generating {len(MOCK_STUDENTS)} detailed student profiled sessions...")
    
    for name, grade, section in MOCK_STUDENTS:
        session_id = str(uuid.uuid4())
        created_time = datetime.now() - timedelta(days=random.randint(0, 5), hours=random.randint(0, 23))
        
        # Decide cohesive student sentiment profile
        profile = random.choice(["confident", "needs_support", "neutral"])
        
        # 1. Insert Profiled Student Session
        cursor.execute(
            """INSERT INTO sessions 
               (session_id, created_at, completed, student_name, student_grade, student_section) 
               VALUES (?, ?, 1, ?, ?, ?)""",
            (session_id, created_time.isoformat(), name, grade, section.upper())
        )
        
        # 2. Insert answers for each dynamically loaded question
        for q_id, q_def in question_defs.items():
            ans_text = ""
            
            if q_def["type"] == "mcq":
                opts = list(q_def["options"].keys())
                if profile == "confident":
                    ans_text = random.choice(opts[:2])
                elif profile == "needs_support":
                    ans_text = random.choice(opts[-2:])
                else:
                    ans_text = random.choice(opts)
                    
            elif q_def["type"] == "checkbox":
                opts = list(q_def["options"].keys())
                k = random.randint(1, min(3, len(opts)))
                selected = random.sample(opts, k)
                ans_text = ",".join(selected)
                
            elif q_def["type"] == "open":
                sentences = MOCK_FEEDBACK[profile]
                ans_text = random.choice(sentences)
                if random.random() < 0.35:
                    ans_text = f"This is an excellent experience! {ans_text} I have a good time here."
                    
            cursor.execute(
                "INSERT INTO responses (session_id, question_id, answer_text) VALUES (?, ?, ?)",
                (session_id, q_id, ans_text)
            )
            
    conn.commit()
    conn.close()
    print("Database multi-profile student seeding completed successfully!")

if __name__ == "__main__":
    seed()
