const db = require('./database');
const analysis = require('./analysis');

let dbInitialized = false;

async function ensureDb() {
  if (!dbInitialized) {
    await db.initDb();
    dbInitialized = true;
  }
}

exports.handler = async (event, context) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    await ensureDb();
  } catch (e) {
    console.error('DB init error:', e);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Database initialization failed: ' + e.message }) };
  }

  // Parse the path: /api/v1/questions -> v1/questions
  const path = event.path.replace(/^\/api\//, '').replace(/^\.netlify\/functions\/api\//, '');

  try {
    // GET /api/health
    if (path === 'health' && event.httpMethod === 'GET') {
      return {
        statusCode: 200, headers,
        body: JSON.stringify({ status: 'healthy', db: process.env.DATABASE_URL ? 'configured' : 'missing' })
      };
    }

    // GET /api/v1/questions
    if (path === 'v1/questions' && event.httpMethod === 'GET') {
      const q = await db.getQuestionsFromDb();
      return { statusCode: 200, headers, body: JSON.stringify(q) };
    }

    // POST /api/v1/sessions
    if (path === 'v1/sessions' && event.httpMethod === 'POST') {
      const body = JSON.parse(event.body);
      await db.createSession(body.session_id, body.student_name, body.student_grade, body.student_section);
      return { statusCode: 200, headers, body: JSON.stringify({ status: 'success' }) };
    }

    // POST /api/v1/responses/submit
    if ((path === 'v1/responses/submit' || path === 'v1/responses/submit/') && event.httpMethod === 'POST') {
      const body = JSON.parse(event.body);
      if (!body.session_id || !body.answers) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing session_id or answers' }) };
      }
      for (const [qId, ansText] of Object.entries(body.answers)) {
        await db.saveResponse(body.session_id, parseInt(qId), ansText);
      }
      await db.completeSession(body.session_id);
      return { statusCode: 200, headers, body: JSON.stringify({ status: 'success' }) };
    }

    // GET /api/v1/analytics
    if (path === 'v1/analytics' && event.httpMethod === 'GET') {
      const params = event.queryStringParameters || {};
      const grade = params.grade ? parseInt(params.grade) : null;
      const section = params.section || null;

      const count = await db.getCompletedSessionsCount(grade, section);
      const responses = await db.getAllCompletedResponses(grade, section);
      const questions = await db.getQuestionsFromDb();

      const quant = analysis.analyzeQuantitative(responses, questions);
      const qual = analysis.analyzeQualitative(responses, questions);

      return {
        statusCode: 200, headers,
        body: JSON.stringify({ total_completed: count, quantitative: quant, qualitative: qual })
      };
    }

    // GET /api/v1/submissions
    if (path === 'v1/submissions' && event.httpMethod === 'GET') {
      const params = event.queryStringParameters || {};
      const grade = params.grade ? parseInt(params.grade) : null;
      const section = params.section || null;

      const submissions = await db.getDetailedSubmissions(grade, section);
      return { statusCode: 200, headers, body: JSON.stringify(submissions) };
    }

    // 404 fallback
    return {
      statusCode: 404, headers,
      body: JSON.stringify({ error: 'Not found', path: path, method: event.httpMethod })
    };

  } catch (e) {
    console.error('Handler error:', e);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
