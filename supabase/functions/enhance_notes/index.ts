/**
 * Enhance Notes Edge Function
 *
 * Uses Claude API to rewrite time entry notes for billing justification.
 * Focuses on what/why/how + effort context in professional, concise language.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface EnhanceRequest {
  notes: string | null;
  description: string | null;
  employee_name: string;
  customer: string;
  cost_code: string;
  service_item_name: string;
  hours: number;
  minutes: number;
  date: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('✨ Enhance Notes: Starting...');

    const body: EnhanceRequest = await req.json();
    const { notes, description, employee_name, customer, cost_code, service_item_name, hours, minutes, date } = body;

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }

    const originalText = notes || description || '';
    if (!originalText.trim()) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'No notes or description to enhance'
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400
        }
      );
    }

    const totalHours = hours + (minutes / 60);

    const prompt = `You are a billing specialist for an expert witness and litigation consulting firm (Mitigation Consulting). Your job is to rewrite brief technician time entry notes into professional billing descriptions suitable for client invoices.

CRITICAL CONTEXT:
- The EMPLOYEE listed below is the person who performed ALL of the work described in the notes.
- Other people mentioned by name or initials (e.g., "DH", "JK", "Smith") are typically clients, attorneys, opposing experts, or information sources — NOT the people doing the work.
- Example: "Reviewed notes from DH regarding site visit" means the EMPLOYEE reviewed notes that DH provided about a site visit. The employee did the reviewing.
- This is a consulting firm that does expert witness work, site inspections, document review, standards analysis, and litigation support.

Time Entry Context:
- Employee (the person who did the work): ${employee_name}
- Customer/Project: ${customer}
- Cost Code: ${cost_code || service_item_name}
- Date: ${date}
- Duration: ${totalHours.toFixed(1)} hours

Original Technician Notes:
"${originalText}"

Requirements:
1. The EMPLOYEE is always the actor — they are the one who reviewed, analyzed, prepared, inspected, etc.
2. Preserve the original meaning exactly — do not change who did what or add actions not described
3. Describe WHAT the employee did and WHY (the purpose) in professional consulting language
4. If methodology or specific standards are mentioned (ASTM, IBC, etc.), keep them
5. Keep references to specific people, documents, or sites as they appear — do not remove or rename them
6. Write 2-4 concise sentences appropriate for an invoice line item
7. Use past tense, third person (e.g., "Reviewed and analyzed..." not "I reviewed...")
8. Do NOT include the employee name, date, or hours — those are shown separately on the invoice
9. Do NOT fabricate details, quantities, or specifics not present in the original notes
10. If the original notes are already professional and clear, make only minimal improvements

Respond with ONLY the enhanced notes text, no quotes or labels.`;

    console.log('📡 Calling Claude API...');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 500,
        messages: [
          {
            role: 'user',
            content: prompt,
          }
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Claude API error (${response.status}): ${errorText}`);
    }

    const result = await response.json();
    const enhancedNotes = result.content?.[0]?.text?.trim() || '';

    if (!enhancedNotes) {
      throw new Error('No content returned from Claude API');
    }

    console.log(`✅ Enhanced notes generated (${enhancedNotes.length} chars)`);

    return new Response(
      JSON.stringify({
        success: true,
        enhanced_notes: enhancedNotes,
        original_notes: originalText,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error: any) {
    console.error('❌ Enhance Notes failed:', error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        stack: error.stack
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
