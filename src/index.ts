/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.jsonc`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */



import { WorkflowEntrypoint, WorkflowStep } from 'cloudflare:workers';

/**
 * 1. DEFINICIÓN DE TIPOS
 */
export interface Env {
	AI: any;
	DB: D1Database;
	VECTORIZE: VectorizeIndex;
	EMAIL_WORKFLOW: Workflow;
}

/**
 * 2. WORKFLOW: PROCESAMIENTO ASÍNCRONO DE EMAIL
 * Esto asegura que si la API de email falla, se reintente sin afectar al chat.
 */
export class EmailAutomationWorkflow extends WorkflowEntrypoint<Env> {
	async run(event: any, step: WorkflowStep) {
		const { subject, body, userEmail } = event.params;

		await step.do('send-email-task', async () => {
		console.log(`Simulando envío de email a CCOM...`);
		console.log(`Asunto: ${subject} | De: ${userEmail}`);
		// Aquí conectarías con Resend o MailChannels
		return { success: true };
		});
	}
}

/**
 * 3. LÓGICA PRINCIPAL DEL WORKER
 */
export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		if (request.method !== 'POST') {
		return new Response('Envíe un POST con { "message": "...", "userId": "..." }', { status: 405 });
		}

		const { message, userId = 'guest' } = await request.json() as any;

		// A. GENERAR EMBEDDING Y BUSCAR EN VECTORIZE (RAG)
		// Esto busca información específica del CCOM guardada previamente
		const embeddingResponse = await env.AI.run('@cf/baai/bge-base-en-v1.5', { text: [message] });
		const userVector = embeddingResponse.data[0];
		const matches = await env.VECTOR_INDEX_NAME.query(userVector, { topK: 3, returnMetadata: true });
		
		const contextText = matches.matches.length > 0 
		? matches.matches.map(m => m.metadata?.text).join('\n')
		: "No hay información específica adicional.";

		// B. RECUPERAR MEMORIA (D1)
		// Obtenemos los últimos 5 mensajes para dar continuidad a la charla
		const { results: history } = await env.DB.prepare(
		"SELECT role, content FROM chat_history WHERE user_id = ? ORDER BY id DESC LIMIT 5"
		).bind(userId).all();
		
		const chatHistory = history.reverse();

		// C. CONSTRUIR PROMPT DE SISTEMA
		const SYSTEM_PROMPT = `
		Eres el Asistente Virtual de Ciencias de Cómputo (CCOM) de la UPR Rio Piedras.
		USA ESTE CONTEXTO PARA RESPONDER: ${contextText}
		REGLAS:
		1. Sé formal y servicial. 
		2. Si el usuario quiere contactar al director o enviar una duda oficial, usa la herramienta 'send_email'.
		3. Si no sabes algo, sugiere contactar al departamento.
		`;

		// D. EJECUTAR LLAMA 3.3 CON TOOLS
		const aiResponse = await env.AI.run('@cf/meta/llama-3.3-70b-instruct', {
		messages: [
			{ role: 'system', content: SYSTEM_PROMPT },
			...chatHistory,
			{ role: 'user', content: message }
		],
		tools: [
			{
			name: 'send_email',
			description: 'Envía un email oficial al departamento de CCOM UPRRP',
			parameters: {
				type: 'object',
				properties: {
				subject: { type: 'string', description: 'Asunto claro del correo' },
				body: { type: 'string', description: 'Cuerpo detallado del mensaje' }
				},
				required: ['subject', 'body']
			}
			}
		]
		});

		// E. PROCESAR RESPUESTA (TOOL CALLING O TEXTO)
		let finalResponse = aiResponse.response || "Lo siento, tuve un problema procesando eso.";

		if (aiResponse.tool_calls) {
		for (const call of aiResponse.tool_calls) {
			if (call.name === 'send_email') {
			// Disparamos el Workflow de forma asíncrona
			await env.EMAIL_WORKFLOW.create({
				params: { ...call.arguments, userEmail: 'estudiante@upr.edu' }
			});
			finalResponse = "He iniciado el proceso de envío de tu correo al departamento. ¿Hay algo más en qué pueda ayudarte?";
			}
		}
		}

		// F. GUARDAR EN LA MEMORIA (D1)
		await env.DB.prepare(
		"INSERT INTO chat_history (user_id, role, content) VALUES (?, 'user', ?), (?, 'assistant', ?)"
		).bind(userId, message, userId, finalResponse).run();

		return new Response(JSON.stringify({ response: finalResponse }), {
		headers: { 'Content-Type': 'application/json' }
		});
	}
};