# cf_ai_application_project

work in progress...


Para que tu proyecto destaque en la oferta de trabajo, el `README.md` debe ser profesional, técnico y estar bien estructurado. He diseñado este archivo resaltando el uso de **RAG (Retrieval-Augmented Generation)** y la arquitectura "Serverless First".

Copia y pega esto en tu archivo `README.md`:

---

```markdown
# CCOM Assistant - Cloudflare AI Agent 🎓

A professional AI Assistant for the Computer Science Department (CCOM) at UPR Rio Piedras. Built with a **Serverless RAG Architecture** using Cloudflare Workers, Vectorize, and D1.

## 🚀 Features

-   **RAG (Retrieval-Augmented Generation):** Enhances LLM responses with real-time department data (courses, faculty, office hours).
-   **Conversation Memory:** Persistent chat history stored in **Cloudflare D1**.
-   **Tool Calling:** Capability to trigger workflows, such as sending official emails.
-   **High Performance:** Powered by `llama-3.1-8b-instruct` running on Cloudflare's global edge network.

## 🛠️ Tech Stack

-   **Runtime:** [Cloudflare Workers](https://workers.cloudflare.com/)
-   **AI Model:** `@cf/meta/llama-3.1-8b-instruct`
-   **Vector Database:** [Cloudflare Vectorize](https://developers.cloudflare.com/vectorize/)
-   **Database (SQL):** [Cloudflare D1](https://developers.cloudflare.com/d1/)
-   **IaC:** Wrangler CLI

---

## 📋 Prerequisites

-   Node.js & npm
-   Cloudflare Account with Workers AI, D1, and Vectorize enabled.
-   Wrangler CLI (`npm install -g wrangler`)

## ⚙️ Setup & Installation

1. **Clone the repository:**
   ```bash
   git clone <your-repo-url>
   cd cf_ai_agent_project

```

2. **Initialize the Database:**
Create your D1 database and apply the initial schema:
```bash
npx wrangler d1 execute ccom_db --remote --command "CREATE TABLE chat_history (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, role TEXT, content TEXT);"

```


3. **Configure Environment:**
Update your `wrangler.toml` (or `wrangler.json`) with your specific `database_id`.
4. **Deploy to Cloudflare:**
```bash
npx wrangler deploy

```


5. **Seed the Knowledge Base:**
Visit the following endpoint to populate the Vectorize index with CCOM information:
`https://cf-ai-ccom-assistant.<your-subdomain>.workers.dev/seed`

---

## 🛠️ API Usage

### Chat Endpoint

**POST** `/`

```json
{
  "message": "Who is the director of the CCOM department?",
  "userId": "student_01"
}

```

### Knowledge Ingestion

**GET** `/seed`
Triggers the ingestion of department data into the Vectorize index using `bge-base-en-v1.5` embeddings.

---

## 🧠 System Architecture

1. **Request:** User sends a query via POST.
2. **Retrieval:** Worker generates an embedding and queries **Vectorize** for context.
3. **Memory:** Previous messages are fetched from **D1**.
4. **Generation:** **Workers AI** processes the prompt (System + Context + History) and returns a response.
5. **Persistence:** The interaction is saved back to D1.

## 📄 Prompt Engineering

Details about the system prompts and tool definitions can be found in the [PROMPTS.md](https://www.google.com/search?q=./PROMPTS.md) file.
