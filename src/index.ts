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
 */
export class EmailAutomationWorkflow extends WorkflowEntrypoint<Env> {
    async run(event: any, step: WorkflowStep) {
        const { subject, body, userEmail } = event.params;

        await step.do('send-email-task', async () => {
            console.log(`Simulando envío de email a CCOM...`);
            console.log(`Asunto: ${subject} | De: ${userEmail}`);
            return { success: true };
        });
    }
}

/**
 * 3. LÓGICA PRINCIPAL DEL WORKER
 */
export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        // Validación de método
		// Dentro de tu fetch en index.ts
		// 1. Definir el objeto URL para manejar rutas
        const url = new URL(request.url);

        // 2. RUTA DE SEEDING (Alimentar la IA)
		if (url.pathname === '/seed') {
			const ccomInfo = [
				"El Departamento de Ciencias de Cómputo (CCOM) está en el Edificio de Ciencias Naturales Fase II, STE 1701. Contacto: 787-764-0000 ext. 88341.",
				"Programas: Bachillerato (ABET), Menores en Ciberseguridad y Programación, Maestría y Doctorado en Ciencias de Cómputo.",
				"Investigación: IA, Ciencia de Datos, Ciberseguridad y Bioinformática.",
				"Cursos clave: CCOM 3033 (Programación I), CCOM 3034 (Estructuras de Datos), CCOM 5050 (Algoritmos)."
			];

			for (const text of ccomInfo) {
				// 1. Generar el embedding
				const { data } = await env.AI.run('@cf/baai/bge-base-en-v1.5', { text: [text] });
				
				// 2. Insertar en Vectorize con el texto original en metadata
				await env.VECTORIZE.upsert([{
					id: crypto.randomUUID(),
					values: data[0],
					metadata: { text }
				}]);
			}
			return new Response("Knowledge base seeded with UPRRP CCOM data!");
		}
		
        if (request.method !== 'POST') {
            return new Response('Envíe un POST con { "message": "...", "userId": "..." }', { status: 405 });
        }

        // LECTURA ÚNICA DEL JSON (Evita el error de stream locked)
        const payload = await request.json() as any;
        const message = payload.message || "";
        const userId = payload.userId || 'guest';

        try {
            // A. GENERAR EMBEDDING (BGE-BASE) PARA RAG
            // Usamos un modelo de embedding, NO un modelo de chat para esto
            const embeddingResponse = await env.AI.run('@cf/baai/bge-base-en-v1.5', { 
                text: [message] 
            });
            const userVector = embeddingResponse.data[0];

            // B. BUSCAR EN VECTORIZE
            const matches = await env.VECTORIZE.query(userVector, { topK: 3, returnMetadata: true });
            const contextText = matches.matches.length > 0 
                ? matches.matches.map(m => m.metadata?.text).join('\n')
                : "No hay información específica adicional en la base de conocimientos.";

            // C. RECUPERAR MEMORIA (D1)
            const { results: history } = await env.DB.prepare(
                "SELECT role, content FROM chat_history WHERE user_id = ? ORDER BY id DESC LIMIT 5"
            ).bind(userId).all();
            const chatHistory = (history || []).reverse();

            // D. CONSTRUIR EL PROMPT DINÁMICO
            // const dynamicSystemPrompt = `
            //     Eres el Asistente Virtual de Ciencias de Cómputo (CCOM) de la UPR Rio Piedras.
            //     USA ESTE CONTEXTO PARA RESPONDER: ${contextText}
            //     REGLAS:
            //     1. Sé formal y servicial. 
            //     2. Si el usuario quiere contactar al director o enviar una duda oficial, usa la herramienta 'send_email'.
            //     3. Si no sabes algo, sugiere contactar al departamento.
            // `;
			const dynamicSystemPrompt = `
				Eres el Asistente Virtual de CCOM UPRRP. 
				
				CONTEXTO RECUPERADO:
				${contextText}
				
				INSTRUCCIONES:
				1. Responde preguntas generales usando SOLAMENTE el CONTEXTO arriba.
				2. Si la respuesta NO está en el contexto, di "No tengo esa información en mis registros, pero puedo ayudarte a enviar un correo al departamento si lo deseas".
				3. SOLO usa la herramienta 'send_email' si el usuario te lo pide EXPLÍCITAMENTE (ej: "envía un correo", "escríbeles por mí"). 
				4. NO envíes correos automáticamente para preguntas informativas.
			`;

            // E. EJECUTAR INFERENCIA CON LLAMA 3.1 (Soporta Tool Calling mejor que 3.3 en Free Tier)
            const aiResponse = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
                messages: [
                    { role: 'system', content: dynamicSystemPrompt },
                    ...chatHistory.map((h: any) => ({ role: h.role, content: h.content })),
                    { role: 'user', content: message }
                ],
                tools: [
                    {
                        name: 'send_email',
                        description: 'LLAMAR SOLO SI EL USUARIO PIDE EXPLÍCITAMENTE ENVIAR UN MENSAJE O CORREO FORMAL.',
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

            // F. PROCESAR RESPUESTA (TOOL CALLING O TEXTO)
            let finalResponse = aiResponse.response || "No pude generar una respuesta.";

            if (aiResponse.tool_calls && aiResponse.tool_calls.length > 0) {
                for (const call of aiResponse.tool_calls) {
                    if (call.name === 'send_email') {
                        await env.EMAIL_WORKFLOW.create({
                            params: { 
                                subject: call.arguments.subject, 
                                body: call.arguments.body, 
                                userEmail: 'estudiante@upr.edu' 
                            }
                        });
                        finalResponse = "He recibido tu solicitud y estoy procesando el envío de un correo oficial al departamento. ¿Deseas algo más?";
                    }
                }
            }

            // G. GUARDAR EN LA MEMORIA (D1)
            try {
                await env.DB.prepare(
                    "INSERT INTO chat_history (user_id, role, content) VALUES (?, 'user', ?), (?, 'assistant', ?)"
                ).bind(userId, message, userId, finalResponse).run();
            } catch (dbError) {
                console.error("Error en D1:", dbError);
            }

            return new Response(JSON.stringify({ response: finalResponse }), {
                headers: { 'Content-Type': 'application/json' }
            });

        } catch (error: any) {
            console.error("Worker Error:", error);
            return new Response(JSON.stringify({ error: error.message }), { 
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }
    }
};