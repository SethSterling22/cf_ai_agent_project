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




export default {
	async fetch(request, env): Promise<Response> {
		const { message } = await request.json();

		// 1. Convertir la pregunta del usuario en un vector (Embedding)
		const userQueryVector = await env.AI.run('@cf/baai/bge-base-en-v1.5', { text: [message] });

		// 2. Buscar información relevante en Vectorize (RAG)
		const matches = await env.VECTOR_INDEX.query(userQueryVector.data[0], { topK: 3 });
		const context = matches.matches.map(m => m.metadata.text).join("\n");

		// 3. Llamar a Llama 3.3 con el contexto y la pregunta
		const response = await env.AI.run('@cf/meta/llama-3.3-70b-instruct', {
		messages: [
			{ role: 'system', content: `Eres un asistente de la UPRRP. Usa este contexto: ${context}` },
			{ role: 'user', content: message }
		],
		tools: [ // Aquí defines que el modelo puede "enviar emails"
			{
			name: 'sendEmailWorkflow',
			description: 'Envía un email formal al departamento de CCOM',
			parameters: { type: 'object', properties: { subject: { type: 'string' }, body: { type: 'string' } } }
			}
		]
		});

		return new Response(JSON.stringify(response));
	}
} satisfies ExportedHandler<Env>;