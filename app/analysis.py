import re
from collections import Counter
import nltk
from nltk.tokenize import word_tokenize
from nltk.corpus import stopwords

# Ensure NLTK data is loaded or has fallback
try:
    from nltk.sentiment.vader import SentimentIntensityAnalyzer
    _sia = SentimentIntensityAnalyzer()
    HAS_VADER = True
except Exception:
    HAS_VADER = False

# Strictly enforce neutral tone by filtering purely evaluative words
EVALUATIVE_BLACKLIST = {
    'good', 'excellent', 'great', 'amazing', 'awesome', 'bad', 'terrible', 'wonderful', 
    'nice', 'super', 'fantastic', 'perfect', 'horrible', 'best', 'worst', 'cool',
    'love', 'hate', 'like', 'dislike', 'fine', 'lovely', 'pretty', 'happy', 'sad'
}

# Domain-specific sentiment cues
CONFIDENT_CUES = {
    'lead', 'leader', 'leadership', 'charge', 'share', 'excited', 
    'helped', 'help', 'made sure', 'initiative', 'confident', 'confidence',
    'easy', 'glad', 'proud', 'creative', 'solver', 'solving', 'stronger', 
    'thrive', 'initiative', 'contribute', 'praise', 'guid', 'guide', 'teach'
}

NEEDS_SUPPORT_CUES = {
    'nervous', 'unsure', 'unhappy', 'difficult', 'hard', 'less confident', 
    'scared', 'struggle', 'struggling', 'confused', 'afraid', 'mistake', 
    'wrong', 'fear', 'worried', 'lonely', 'worry', 'intimidated', 'quiet', 
    'hide', 'ignore', 'impossible', 'stress', 'stressed', 'pressur',
    'anxious', 'not sure', 'growing', 'rarely', 'never', 'support'
}

def analyze_quantitative(responses, question_defs):
    """
    Calculate frequency distributions for all multiple-choice and checkbox questions.
    """
    distributions = {}
    for q_id, q_def in question_defs.items():
        if q_def["type"] in ("mcq", "checkbox"):
            # Initialize distributions with 0 for each option
            distributions[q_id] = {opt: 0 for opt in q_def["options"].keys()}
            
    # Count occurrences
    for resp in responses:
        q_id = resp["question_id"]
        answer = resp["answer_text"]
        if q_id not in distributions or not answer:
            continue
            
        q_type = question_defs[q_id]["type"]
        if q_type == "mcq":
            ans_clean = str(answer).strip().lower()
            if ans_clean in distributions[q_id]:
                distributions[q_id][ans_clean] += 1
        elif q_type == "checkbox":
            parts = [p.strip().lower() for p in str(answer).split(",") if p.strip()]
            for part in parts:
                if part in distributions[q_id]:
                    distributions[q_id][part] += 1
                    
    return distributions

def analyze_sentiment_raw(text: str) -> str:
    """
    Categorize a single open-ended response into three actionable buckets.
    """
    text_lower = text.lower()
    
    has_needs_support = any(cue in text_lower for cue in NEEDS_SUPPORT_CUES)
    has_confident = any(cue in text_lower for cue in CONFIDENT_CUES)
    
    if has_needs_support:
        return "Needs Support"
        
    if HAS_VADER:
        try:
            sia = SentimentIntensityAnalyzer()
            score = sia.polarity_scores(text)['compound']
            if score < -0.15:
                return "Needs Support"
            elif score > 0.25:
                return "Confident"
            else:
                if has_confident:
                    return "Confident"
                return "Neutral"
        except Exception:
            pass
            
    if has_confident:
        return "Confident"
        
    return "Neutral"

def extract_pos_keywords_for_texts(texts, top_n=10):
    """
    Extracts action verbs and descriptive nouns for a specific list of text strings.
    """
    all_verbs = []
    all_nouns = []
    
    # NLTK Stopwords
    try:
        stop_words = set(stopwords.words('english'))
    except Exception:
        stop_words = {'i', 'me', 'my', 'myself', 'we', 'our', 'ours', 'ourselves', 'you', "you're", "you've", "you'll", "you'd", 'your', 'yours', 'yourself', 'yourselves', 'he', 'him', 'his', 'himself', 'she', "she's", 'her', 'hers', 'herself', 'it', "it's", 'its', 'itself', 'they', 'them', 'their', 'theirs', 'themselves', 'what', 'which', 'who', 'whom', 'this', 'that', "that'll", 'these', 'those', 'am', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'having', 'do', 'does', 'did', 'doing', 'a', 'an', 'the', 'and', 'but', 'if', 'or', 'because', 'as', 'until', 'while', 'of', 'at', 'by', 'for', 'with', 'about', 'against', 'between', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'to', 'from', 'up', 'down', 'in', 'out', 'on', 'off', 'over', 'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'any', 'both', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 's', 't', 'can', 'will', 'just', 'don', "don't", 'should', "should've", 'now', 'd', 'll', 'm', 'o', 're', 've', 'y', 'ain', 'aren', "aren't", 'couldn', "couldn't", 'didn', "didn't", 'doesn', "doesn't", 'hadn', "hadn't", 'hasn', "hasn't", 'haven', "haven't", 'isn', "isn't", 'ma', 'mightn', "mightn't", 'mustn', "mustn't", 'needn', "needn't", 'shan', "shan't", 'shouldn', "shouldn't", 'wasn', "wasn't", 'weren', "weren't", 'won', "won't", 'wouldn', "wouldn't"}

    for text in texts:
        text_clean = str(text).strip()
        if not text_clean:
            continue
            
        try:
            tokens = word_tokenize(text_clean)
            tagged = nltk.pos_tag(tokens)
        except Exception:
            # Fallback simple POS guesser
            words = re.findall(r'\b[a-zA-Z]+\b', text_clean.lower())
            tagged = []
            for w in words:
                if w in stop_words or w in EVALUATIVE_BLACKLIST:
                    continue
                if w.endswith('ing') or w.endswith('ed') or w in ('do', 'make', 'help', 'take', 'lead', 'share', 'say', 'feel', 'want', 'hear', 'see'):
                    tagged.append((w, 'VB'))
                else:
                    tagged.append((w, 'NN'))
            
        for word, tag in tagged:
            word_clean = word.lower()
            if (
                word_clean in stop_words 
                or word_clean in EVALUATIVE_BLACKLIST 
                or not word_clean.isalpha() 
                or len(word_clean) < 3
            ):
                continue
                
            if tag.startswith('VB'):
                all_verbs.append(word_clean)
            elif tag.startswith('NN'):
                all_nouns.append(word_clean)
                
    verb_counts = Counter(all_verbs).most_common(top_n)
    noun_counts = Counter(all_nouns).most_common(top_n)
    
    return {
        "verbs": [{"word": w, "count": c} for w, c in verb_counts],
        "nouns": [{"word": w, "count": c} for w, c in noun_counts]
    }

def analyze_qualitative(responses, question_defs):
    """
    Analyze qualitative open-ended responses:
    1. Overall Sentiment buckets.
    2. Overall Keyword theme extractions (verbs/nouns).
    3. Specialized Intent Blocks:
       - Problems Panel (using Q15 responses)
       - Leadership Panel (using Q16, Q17, Q20 responses)
       - Aspirations Panel (using Q10, Q25 responses)
    """
    sentiment_buckets = {
        "Confident": [],
        "Neutral": [],
        "Needs Support": []
    }
    
    all_open_texts = []
    
    # Intent-specific lists
    problem_texts = []
    leadership_texts = []
    aspiration_texts = []
    
    problem_responses = []
    leadership_responses = []
    aspiration_responses = []

    for resp in responses:
        q_id = resp["question_id"]
        answer = resp["answer_text"]
        q_def = question_defs.get(q_id, {})
        
        if q_def.get("type") != "open" or not answer:
            continue
            
        text = str(answer).strip()
        if not text:
            continue
            
        all_open_texts.append(text)
        sentiment = analyze_sentiment_raw(text)
        
        resp_item = {
            "session_id": resp["session_id"],
            "question_id": q_id,
            "question_text": q_def["text"],
            "response": text,
            "sentiment": sentiment
        }
        
        # Overall Sentiment Bucketing
        sentiment_buckets[sentiment].append(resp_item)
        
        # Isolate Problems (focusing on Q15 "Is there anything about your classroom that makes you feel less confident?")
        if q_id == 15:
            problem_texts.append(text)
            problem_responses.append(resp_item)
            
        # Isolate Leadership (focusing on Q16, Q17, Q20)
        elif q_id in (16, 17, 20):
            leadership_texts.append(text)
            leadership_responses.append(resp_item)
            
        # Isolate Aspirations (focusing on Q10 "What do you wish your teacher or classmates notice/say...", Q25 "what would help you thrive...")
        elif q_id in (10, 25):
            aspiration_texts.append(text)
            aspiration_responses.append(resp_item)

    # Keywords Cloud
    overall_keywords = extract_pos_keywords_for_texts(all_open_texts)
    problem_keywords = extract_pos_keywords_for_texts(problem_texts)
    leadership_keywords = extract_pos_keywords_for_texts(leadership_texts)
    aspiration_keywords = extract_pos_keywords_for_texts(aspiration_texts)
    
    return {
        "sentiment_buckets": sentiment_buckets,
        "keywords": overall_keywords,
        
        # Specialized panels data
        "problems": {
            "keywords": problem_keywords,
            "responses": problem_responses
        },
        "leadership": {
            "keywords": leadership_keywords,
            "responses": leadership_responses
        },
        "aspirations": {
            "keywords": aspiration_keywords,
            "responses": aspiration_responses
        }
    }
