import { WorkflowEntrypoint, WorkflowStep } from 'cloudflare:workers';

export class EmailAutomationWorkflow extends WorkflowEntrypoint {
  async run(event: any, step: WorkflowStep) {
    await step.do('send-email', async () => {
      // Aquí usas una API como Postmark o Resend
      // O el propio Email Routing de Cloudflare (SDK pronto disponible)
      console.log(`Enviando email: ${event.subject}`);
    });
  }
}