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

// import { WorkflowEntrypoint, WorkflowStep } from 'cloudflare:workers';

// /**
//  * 1. DEFINICIÓN DE TIPOS
//  */
// export interface Env {
//     AI: any;
//     DB: D1Database;
//     VECTORIZE: VectorizeIndex;
//     EMAIL_WORKFLOW: Workflow;
// }

// /**
//  * 2. WORKFLOW: PROCESAMIENTO ASÍNCRONO DE EMAIL
//  */
// export class EmailAutomationWorkflow extends WorkflowEntrypoint<Env> {
//     async run(event: any, step: WorkflowStep) {
//         const { subject, body, userEmail } = event.params;

//         await step.do('send-email-task', async () => {
//             console.log(`Simulando envío de email a CCOM...`);
//             console.log(`Asunto: ${subject} | De: ${userEmail}`);
//             return { success: true };
//         });
//     }
// }

// const SYSTEM_PROMPT_TEMPLATE = (context: string) => `
// Eres el Asistente de CCOM UPRRP. 
// CONTEXTO OFICIAL: ${context}

// REGLAS:
// 1. Responde de forma concisa usando el CONTEXTO.
// 2. Si la información no está en el contexto, sé honesto.
// 3. SOLO usa 'send_email' si el usuario pide enviar un mensaje formal.
// `;


// /**
//  * 3. LÓGICA PRINCIPAL DEL WORKER
//  */
// export default {
//     async fetch(request: Request, env: Env): Promise<Response> {
//         // Validación de método
// 		// Dentro de tu fetch en index.ts
// 		// 1. Definir el objeto URL para manejar rutas
//         const url = new URL(request.url);

//         // 2. RUTA DE SEEDING (Alimentar la IA)
// 		if (url.pathname === '/seed') {
// 			const ccomInfo = [
// 				"El Departamento de Ciencias de Cómputo (CCOM) está en el Edificio de Ciencias Naturales Fase II, STE 1701. Contacto: 787-764-0000 ext. 88341.",
// 				"Programas: Bachillerato (ABET), Menores en Ciberseguridad y Programación, Maestría y Doctorado en Ciencias de Cómputo.",
// 				"Investigación: IA, Ciencia de Datos, Ciberseguridad y Bioinformática.",
// 				"Cursos clave: CCOM 3033 (Programación I), CCOM 3034 (Estructuras de Datos), CCOM 5050 (Algoritmos).",
// 				"El director del departamento de Ciencias de Cómputos es José Ortiz Ubarri"
// 			];

// 			for (const text of ccomInfo) {
// 				// 1. Generar el embedding
// 				const { data } = await env.AI.run('@cf/baai/bge-base-en-v1.5', { text: [text] });
				
// 				// 2. Insertar en Vectorize con el texto original en metadata
// 				await env.VECTORIZE.upsert([{
// 					id: crypto.randomUUID(),
// 					values: data[0],
// 					metadata: { text }
// 				}]);
// 			}
// 			return new Response("Knowledge base seeded with UPRRP CCOM data!");
// 		}

//         if (request.method !== 'POST') {
//             return new Response('Envíe un POST con { "message": "..."}', { status: 405 });
//         }

//         // LECTURA ÚNICA DEL JSON (Evita el error de stream locked)
//         const payload = await request.json() as any;
//         const message = payload.message || "";
//         const userId = payload.userId || 'guest';

//         try {
//             // A. GENERAR EMBEDDING (BGE-BASE) PARA RAG
//             // Usamos un modelo de embedding, NO un modelo de chat para esto
//             const embeddingResponse = await env.AI.run('@cf/baai/bge-base-en-v1.5', { 
//                 text: [message] 
//             });
//             const userVector = embeddingResponse.data[0];

//             // B. BUSCAR EN VECTORIZE
//             const matches = await env.VECTORIZE.query(userVector, { topK: 3, returnMetadata: true });
//             const contextText = matches.matches.length > 0 
//                 ? matches.matches.map(m => m.metadata?.text).join('\n')
//                 : "No hay información específica adicional en la base de conocimientos.";

//             // C. RECUPERAR MEMORIA (D1)
//             const { results: history } = await env.DB.prepare(
//                 "SELECT role, content FROM chat_history WHERE user_id = ? ORDER BY id DESC LIMIT 5"
//             ).bind(userId).all();
//             const chatHistory = (history || []).reverse();

//             // D. CONSTRUIR EL PROMPT DINÁMICO
//             // const dynamicSystemPrompt = `
//             //     Eres el Asistente Virtual de Ciencias de Cómputo (CCOM) de la UPR Rio Piedras.
//             //     USA ESTE CONTEXTO PARA RESPONDER: ${contextText}
//             //     REGLAS:
//             //     1. Sé formal y servicial. 
//             //     2. Si el usuario quiere contactar al director o enviar una duda oficial, usa la herramienta 'send_email'.
//             //     3. Si no sabes algo, sugiere contactar al departamento.
//             // `;
// 			const dynamicSystemPrompt = `
// 				Eres el Asistente de CCOM UPR Río Piedras (NO Mayagüez ni algún otro recinto).
// 				Información actual: ${contextText}
				
// 				REGLA DE ORO: Si la información está en el texto de arriba, RESPONDE DIRECTAMENTE. 
// 				SOLO usa 'send_email' si el usuario dice literalmente "envía un email" o "escríbeles".
				
// 				INSTRUCCIONES:
// 				1. Responde preguntas generales usando SOLAMENTE el CONTEXTO arriba.
// 				2. Si la respuesta NO está en el contexto, di "No tengo esa información en mis registros, pero puedo ayudarte a enviar un correo al departamento si lo deseas".
// 				3. SOLO usa la herramienta 'send_email' si el usuario te lo pide EXPLÍCITAMENTE (ej: "envía un correo", "escríbeles por mí"). 
// 				4. NO envíes correos automáticamente para preguntas informativas.
// 			`;

//             // E. EJECUTAR INFERENCIA CON LLAMA 3.1 (Soporta Tool Calling mejor que 3.3 en Free Tier)
//         	const aiResponse = await env.AI.run('@cf/meta/llama-3.3-70b-instruct', {
// 				messages: [
// 					{ role: 'system', content: SYSTEM_PROMPT_TEMPLATE(contextText) },
// 					...history.map((h: any) => ({ role: h.role, content: h.content })),
// 					{ role: 'user', content: message }
// 				],
// 				tools: [{
// 					name: 'send_email',
// 					description: 'Sends a formal email to CCOM department',
// 					parameters: {
// 						type: 'object',
// 						properties: {
// 							subject: { type: 'string' },
// 							body: { type: 'string' }
// 						},
// 						required: ['subject', 'body']
// 					}
// 				}]
// 			});

//             // F. PROCESAR RESPUESTA (TOOL CALLING O TEXTO)
//             // let finalResponse = aiResponse.response || "No pude generar una respuesta.";

// 			let finalResponse = "";

// 			// 1. Si la IA quiere usar una herramienta (Tool Calling)
// 			if (aiResponse.tool_calls && aiResponse.tool_calls.length > 0) {
// 				for (const call of aiResponse.tool_calls) {
// 					if (call.name === 'send_email') {
// 						// Ejecutar el Workflow
// 						await env.EMAIL_WORKFLOW.create({
// 							params: { 
// 								subject: call.arguments.subject, 
// 								body: call.arguments.body, 
// 								userEmail: 'estudiante@upr.edu' 
// 							}
// 						});
// 						finalResponse = "He procesado tu solicitud para enviar un correo al departamento de CCOM en Río Piedras. ¿Hay algo más en lo que pueda ayudarte?";
// 					}
// 				}
// 			} 
// 			// 2. Si la IA simplemente respondió con texto
// 			else if (aiResponse.response) {
// 				finalResponse = aiResponse.response;
// 			} 
// 			else {
// 				finalResponse = "Lo siento, no pude procesar esa solicitud.";
// 			}

// 			// G. GUARDAR EN D1 Y ENVIAR RESPUESTA
// 			await env.DB.prepare(
// 				"INSERT INTO chat_history (user_id, role, content) VALUES (?, 'user', ?), (?, 'assistant', ?)"
// 			).bind(userId, message, userId, finalResponse).run();

// 			return new Response(JSON.stringify({ response: finalResponse }), {
// 				headers: { 'Content-Type': 'application/json' }
// 			});

//         } catch (error: any) {
//             console.error("Worker Error:", error);
//             return new Response(JSON.stringify({ error: error.message }), { 
//                 status: 500,
//                 headers: { 'Content-Type': 'application/json' }
//             });
//         }
//     }
// };


import { WorkflowEntrypoint, WorkflowStep } from 'cloudflare:workers';

export interface Env {
    AI: any;
    DB: D1Database;
    VECTORIZE: VectorizeIndex;
    EMAIL_WORKFLOW: Workflow;
}

// 1. COORDINATION: Workflows (Recomendado)
export class EmailAutomationWorkflow extends WorkflowEntrypoint<Env> {
    async run(event: any, step: WorkflowStep) {
        const { subject, body, userEmail } = event.params;
        await step.do('send-email-task', async () => {
            console.log(`Sending email via Workflow: ${subject}`);
            return { success: true };
        });
    }
}

const SYSTEM_PROMPT_TEMPLATE = (context: string) => `
Eres el Asistente Oficial de CCOM UPRRP. 
BASE DE DATOS DE CONTEXTO: 
${context}

REGLAS DE ORO:
1. Tu prioridad absoluta es contestar preguntas usando la "BASE DE DATOS DE CONTEXTO".
2. NO uses la herramienta 'send_email' para responder preguntas informativas. 
3. SOLO usa 'send_email' si el usuario dice explícitamente palabras como: "envía", "manda", "redacta" o "escríbeles un email".
4. Si no encuentras la información en el contexto, di que no sabes, pero no inventes.
`;

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url);

        // RUTA DE SEEDING (Para Vectorize)
        if (url.pathname === '/seed') {
            const ccomInfo = [
				{ id: "static-1", text: "Los cursos de CCOM son: CCOM 3033 (Programación I), CCOM 3034 (Estructuras de Datos) y CCOM 5050 (Algoritmos)." },
                { id: "static-2", text: "El director del departamento de Ciencias de Cómputos es José Ortiz Ubarri." },
                { id: "static-3", text: "Programas disponibles: Bachillerato (ABET), Maestría y Doctorado en Ciencias de Cómputo." },
                { id: "static-4", text: "Localización: Edificio de Ciencias Naturales Fase II, STE 1701." }
            ];
			
		try {
				for (const text of ccomInfo) {
					// Usamos un modelo de embedding garantizado
					// const result = await env.AI.run('@cf/baai/bge-small-en-v1.5', { text: [text] });
					const result = await env.AI.run('@cf/baai/bge-base-en-v1.5', { text: [text] });
					
					// Verificamos que 'result.data' exista antes de acceder al índice [0]
					if (result && result.data && result.data[0]) {
						await env.VECTORIZE.upsert([{
							id: crypto.randomUUID(),
							values: result.data[0],
							metadata: { text }
						}]);
					} else {
						console.error("Failed to generate embedding for:", text);
					}
				}
				return new Response("Knowledge base seeded successfully!", { status: 200 });
			} catch (e: any) {
				return new Response("Seed Error: " + e.message, { status: 500 });
			}
		}

		// Go to normal POST request actions
        if (request.method !== 'POST') return new Response('Use POST', { status: 405 });

        // LECTURA DE PAYLOAD
        const payload = await request.json() as any;
        const userMessage = payload.message;
        const userId = payload.userId || 'guest';

        // 2. MEMORY & STATE: Recuperar de D1
        const { results } = await env.DB.prepare("SELECT role, content FROM chat_history WHERE user_id = ? ORDER BY id DESC LIMIT 3").bind(userId).all();

        // const history = (results || []).reverse();
		const cleanHistory: { role: string; content: string }[] = [];
		

        // 3. RAG: Búsqueda en Vectorize
        const embedding = await env.AI.run('@cf/baai/bge-base-en-v1.5', { text: [userMessage] });
        const matches = await env.VECTORIZE.query(embedding.data[0], { topK: 3, returnMetadata: true });
        const context = matches.matches.map(m => m.metadata?.text).join('\n');

		// LOG DE DIAGNÓSTICO
		console.log("DEBUG: Matches encontrados:", JSON.stringify(matches.matches));
		console.log("DEBUG: Texto de contexto final:", context);

        // 4. LLM: Llama 3.3-70b (Especificación recomendada)
        const aiResponse = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
			messages: [
                { role: 'system', content: SYSTEM_PROMPT_TEMPLATE(context) },
                { role: 'user', content: userMessage }
            ],
			// tools: [{
			// 	name: 'send_email',
            //     description: 'Enviar email formal',
            //     parameters: {
            //         type: 'object',
            //         properties: { subject: { type: 'string' }, body: { type: 'string' } },
            //         required: ['subject', 'body']
            //     }
			// }]
        });

		console.log("DEBUG: Respuesta de la IA:", aiResponse);


		// 5. COORDINATION: Procesar Tool Calls
        let finalResponse = "";

        // Si la IA devuelve tool_calls pero el mensaje no pide un email,
        // significa que el modelo está ignorando la pregunta informativa.
        const wantsEmail = /envi|escrib|mand|email|correo/i.test(userMessage.toLowerCase());

        if (aiResponse.tool_calls && aiResponse.tool_calls.length > 0 && wantsEmail) {
            const call = aiResponse.tool_calls[0];
            await env.EMAIL_WORKFLOW.create({ params: call.arguments });
            finalResponse = "Entendido. He procesado tu solicitud para enviar un correo electrónico.";
        } 
        else if (aiResponse.response && aiResponse.response !== "") {
            // Caso normal: La IA respondió con texto
            finalResponse = aiResponse.response;
        }
        else {
            /** * REPARACIÓN DE EMERGENCIA: 
             * Si llegamos aquí, la IA devolvió null o una herramienta por error.
             * Hacemos una segunda llamada rápida SIN herramientas para obtener el texto puro
             * basándonos en el contexto que YA tenemos.
             */
            const recoveryResponse = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
                messages: [
                    { role: 'system', content: `Usa este contexto para responder: ${context}. Responde de forma breve.` },
                    { role: 'user', content: userMessage }
                ]
            });
            finalResponse = recoveryResponse.response || recoveryResponse.content || "Lo siento, no pude procesar la respuesta.";
        }

        // 4. LIMPIEZA Y PERSISTENCIA
        const safeResponse = String(finalResponse).trim();
        console.log("DEBUG: Enviando al cliente:", safeResponse);

        try {
            await env.DB.prepare("INSERT INTO chat_history (user_id, role, content) VALUES (?, 'user', ?), (?, 'assistant', ?)")
                .bind(userId, userMessage, userId, safeResponse)
                .run();
        } catch (e) {
            console.error("D1 Error:", e);
        }

        return new Response(JSON.stringify({ response: safeResponse }), { 
            headers: { 'Content-Type': 'application/json' } 
        });	
    }
};