# CCOM Assistant - Cloudflare AI Agent

🚧🏗️🛠️👷 work in progress... 🚧🏗️🛠️👷

A professional AI Assistant for the Computer Science Department (CCOM) at UPR Rio Piedras. Built with a **Serverless RAG Architecture** using Cloudflare Workers, Vectorize, and D1.

## Features

-   **RAG (Retrieval-Augmented Generation):** Enhances LLM responses with real-time department data (courses, faculty, office hours).
-   **Conversation Memory:** Persistent chat history stored in **Cloudflare D1**.
-   **Tool Calling:** Capability to trigger workflows, such as sending official emails.
-   **High Performance:** Powered by `llama-3.3-70b-instruct-fp8-fast` running on Cloudflare's global network.

## Tech Stack

-   **Runtime:** [Cloudflare Workers](https://workers.cloudflare.com/)
-   **AI Model:** `@cf/meta/llama-3.3-70b-instruct-fp8-fast`
-   **Vector Database:** [Cloudflare Vectorize](https://developers.cloudflare.com/vectorize/)
-   **Database (SQL):** [Cloudflare D1](https://developers.cloudflare.com/d1/)
-   **IaC:** Wrangler CLI

---

## Requisites

-   Node.js & npm
-   Cloudflare Account with Workers AI, D1, and Vectorize enabled.
-   Wrangler CLI (`npm install -g wrangler`)

## Setup & Installation

1. **Clone the repository:**
```bash
git clone https://github.com/SethSterling22/cf-ai-agent-project.git
cd cf_ai_agent_project
```


2. **Initialize the Database:**
+ Create your D1 database and apply the initial schema:
```bash
npx wrangler d1 execute ccom_db --remote --command "CREATE TABLE chat_history (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, role TEXT, content TEXT);"
```


+ Create a Vector for the AI Context:
```bash
npx wrangler vectorize create ccom_index --dimensions=768 --metric=cosine
```


3. **Configure Environment:**
Update your `wrangler.toml` or `wrangler.jsonc` with your specific variables, in this case:

```json
{
	"$schema": "node_modules/wrangler/config-schema.json",
	"name": "cf-ai-agent-project",
	"main": "src/index.ts",
	"compatibility_date": "2025-09-27",
	"observability": {
		"enabled": true
	},
	"ai": {
		"binding": "AI"
	},
	"d1_databases": [
		{
			"binding": "DB",
			"database_name": "ccom_db",
			"database_id": "{CLOUDFLARE_DB_ID}"
		}
	],
	"vectorize": [
		{
			"binding": "VECTORIZE",
			"index_name": "{VECTOR_INDEX_NAME}",
			"remote": true
		}
	],
	"workflows": [
		{
			"binding": "EMAIL_WORKFLOW",
			"name": "{WORKFLOW_NAME}",
			"class_name": "EmailAutomationWorkflow"
		}
	]
}
```

### Env Example:

```python
#  Cloudflare Authentication (So Docker can deplopy)
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_API_TOKEN= 

# Resources IDs (From Cloudflare Dashboard)
D1_DATABASE_ID=
VECTOR_INDEX_NAME=

# Logic variables
DEPARTMENT_EMAIL= # ccom.uprrp@upr.edu or Assistant E-mail
# If you use and external e-mail service (TODO)
EMAIL_API_KEY=
```

4. **Deploy to Cloudflare:**
```bash
npx wrangler deploy

```

To see the Logs (Optional):
```bash
npx wrangler deploy && npx wrangler tail
```


5. **Seed the Knowledge Base:**
Make a request to the following endpoint to populate the Vectorize index with your information (Computer Science Department in this case):
`https://cf-ai-agent-project.<your-subdomain>.workers.dev/seed`

---

## API Usage

### Chat Endpoint

**POST** `/`
You can request in your own terminal using `Curl` command:
```bash
curl -X POST https://cf-ai-agent-project.<your-subdomain>.workers.dev   -H "Content-Type: application/json"   -d '{"message": "..."}'
```

Example:
```json
{
  "message": "Who is the director of the CCOM department?"
}

```
### Knowledge Ingestion

**GET** `/seed`
Triggers the ingestion of department data into the Vectorize index using `bge-base-en-v1.5` embeddings.

---

## System Architecture

1. **Request:** User sends a query via POST.
2. **Retrieval:** Worker generates an embedding and queries **Vectorize** for context.
3. **Memory:** Previous messages are fetched from **D1**.
4. **Generation:** **Workers AI** processes the prompt (System + Context + History) and returns a response.
5. **Persistence:** The interaction is saved back to D1.

## Prompt Engineering

Details about the system prompts and tool definitions can be found in the [PROMPTS.md](https://www.google.com/search?q=./PROMPTS.md) file.

## Web Scrapping

Part of the context necessary for the Assistant was obtained using [Firecrawl](https://github.com/firecrawl/firecrawl).
