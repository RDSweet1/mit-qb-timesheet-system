/**
 * Ask Assistant Edge Function
 *
 * AI assistant that answers business questions by querying Supabase tables
 * using Claude's tool-use API. All queries are read-only.
 *
 * Input:  { question: string, conversationId?: string }
 * Output: { success: true, answer: string, sources: string[] }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ─── Tool Definitions ────────────────────────────────────────────────────────

const toolDefinitions = [
  {
    name: 'query_invoices',
    description:
      'Query invoices from qb_invoice_balances. Returns invoice number, customer, dates, amounts, balance, and status. Use this for questions about invoices, accounts receivable, unpaid balances, or overdue invoices.',
    input_schema: {
      type: 'object' as const,
      properties: {
        customer_name: {
          type: 'string',
          description: 'Filter by customer name (partial match, case-insensitive)',
        },
        status: {
          type: 'string',
          enum: ['Paid', 'Partial', 'Open', 'Overdue'],
          description: 'Filter by invoice status',
        },
        min_balance: {
          type: 'number',
          description: 'Only return invoices with balance >= this amount',
        },
      },
      required: [],
    },
  },
  {
    name: 'query_time_entries',
    description:
      'Query time entries logged by employees. Returns employee name, customer, date, hours, minutes, service item, description, and billable status. Use for questions about who worked where, hours logged, billable vs non-billable time, etc. Note: qb_customer_id contains the customer display name, not a numeric ID.',
    input_schema: {
      type: 'object' as const,
      properties: {
        employee_name: {
          type: 'string',
          description: 'Filter by employee name (partial match, case-insensitive)',
        },
        customer_name: {
          type: 'string',
          description: 'Filter by customer name stored in qb_customer_id (partial match, case-insensitive)',
        },
        date_from: {
          type: 'string',
          description: 'Start date filter (YYYY-MM-DD)',
        },
        date_to: {
          type: 'string',
          description: 'End date filter (YYYY-MM-DD)',
        },
        billable_status: {
          type: 'string',
          description: 'Filter by billable status (e.g. "Billable", "NonBillable")',
        },
      },
      required: [],
    },
  },
  {
    name: 'query_profitability',
    description:
      'Query customer profitability snapshots. Returns customer, week, total hours, billable hours, revenue, labor cost, margin, and margin percent. Use for profitability analysis, margin questions, or revenue vs cost comparisons.',
    input_schema: {
      type: 'object' as const,
      properties: {
        customer_name: {
          type: 'string',
          description: 'Filter by customer name (partial match, case-insensitive)',
        },
        week_start: {
          type: 'string',
          description: 'Filter by week start date (YYYY-MM-DD), exact match',
        },
        week_end: {
          type: 'string',
          description: 'Filter profitability to weeks starting on or before this date (YYYY-MM-DD)',
        },
      },
      required: [],
    },
  },
  {
    name: 'query_expenses',
    description:
      'Query expense transactions from daily_review_transactions (where txn_class is expense). Returns vendor, date, amount, category, QB account, and memo. Use for expense analysis, vendor spending, overhead costs, etc.',
    input_schema: {
      type: 'object' as const,
      properties: {
        vendor_name: {
          type: 'string',
          description: 'Filter by vendor name (partial match, case-insensitive)',
        },
        category: {
          type: 'string',
          description: 'Filter by overhead category (partial match, case-insensitive)',
        },
        date_from: {
          type: 'string',
          description: 'Start date filter (YYYY-MM-DD)',
        },
        date_to: {
          type: 'string',
          description: 'End date filter (YYYY-MM-DD)',
        },
      },
      required: [],
    },
  },
  {
    name: 'query_payments',
    description:
      'Query payment records from qb_payments. Returns customer, date, amount, payment method, and reference number. Use for questions about payments received, payment history, or cash inflows.',
    input_schema: {
      type: 'object' as const,
      properties: {
        customer_name: {
          type: 'string',
          description: 'Filter by customer name (partial match, case-insensitive)',
        },
        date_from: {
          type: 'string',
          description: 'Start date filter (YYYY-MM-DD)',
        },
        date_to: {
          type: 'string',
          description: 'End date filter (YYYY-MM-DD)',
        },
      },
      required: [],
    },
  },
  {
    name: 'query_reports',
    description:
      'Query report periods (weekly customer reports). Returns customer, week dates, status (pending/sent/supplemental_sent/accepted/disputed/no_time), total hours, entry count, sent and accepted timestamps. Use for questions about report status, which customers have been sent reports, accepted vs pending reports.',
    input_schema: {
      type: 'object' as const,
      properties: {
        customer_name: {
          type: 'string',
          description: 'Filter by customer name (partial match, case-insensitive)',
        },
        status: {
          type: 'string',
          enum: ['pending', 'sent', 'supplemental_sent', 'accepted', 'disputed', 'no_time'],
          description: 'Filter by report status',
        },
        week_start: {
          type: 'string',
          description: 'Filter by week start date (YYYY-MM-DD), exact match',
        },
      },
      required: [],
    },
  },
  {
    name: 'query_employees',
    description:
      'Query employee cost rates. Returns employee name, base hourly rate, burden multiplier, fully loaded rate, role (technician/admin/owner), and active status. Use for questions about employee rates, labor costs, or staffing.',
    input_schema: {
      type: 'object' as const,
      properties: {
        employee_name: {
          type: 'string',
          description: 'Filter by employee name (partial match, case-insensitive)',
        },
        is_active: {
          type: 'boolean',
          description: 'Filter by active status',
        },
      },
      required: [],
    },
  },
  {
    name: 'query_customers',
    description:
      'Query customer records. Returns display name, email, active status, and QB customer ID. Use for questions about which customers exist, customer contact info, or active vs inactive customers.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: {
          type: 'string',
          description: 'Filter by customer display name (partial match, case-insensitive)',
        },
        is_active: {
          type: 'boolean',
          description: 'Filter by active status',
        },
      },
      required: [],
    },
  },
  {
    name: 'query_daily_review',
    description:
      'Query all daily review transactions (expenses and revenue). Returns entity type, date, amount, vendor, review status (pending/reviewed/auto_approved/flagged), and category. Use for daily financial review questions or overall transaction review status.',
    input_schema: {
      type: 'object' as const,
      properties: {
        review_status: {
          type: 'string',
          enum: ['pending', 'reviewed', 'auto_approved', 'flagged'],
          description: 'Filter by review status',
        },
        date_from: {
          type: 'string',
          description: 'Start date filter (YYYY-MM-DD)',
        },
        date_to: {
          type: 'string',
          description: 'End date filter (YYYY-MM-DD)',
        },
      },
      required: [],
    },
  },
  {
    name: 'query_system_status',
    description:
      'Query system status: scheduled function configurations and recent execution metrics. Returns function name, display name, paused status, schedule day/time, last run time and status. Use for questions about system health, scheduled jobs, or recent function execution results.',
    input_schema: {
      type: 'object' as const,
      properties: {
        function_name: {
          type: 'string',
          description: 'Filter by function name (exact match)',
        },
      },
      required: [],
    },
  },
];

// ─── Tool Execution ──────────────────────────────────────────────────────────

async function executeToolCall(
  supabase: SupabaseClient,
  toolName: string,
  input: Record<string, unknown>
): Promise<{ data: unknown; error: string | null; row_count: number }> {
  try {
    switch (toolName) {
      case 'query_invoices': {
        let query = supabase
          .from('qb_invoice_balances')
          .select('invoice_number, customer_name, txn_date, due_date, total_amount, balance, status');

        if (input.customer_name) {
          query = query.ilike('customer_name', `%${input.customer_name}%`);
        }
        if (input.status) {
          query = query.eq('status', input.status);
        }
        if (input.min_balance !== undefined && input.min_balance !== null) {
          query = query.gte('balance', input.min_balance);
        }

        query = query.order('txn_date', { ascending: false }).limit(200);
        const { data, error } = await query;
        if (error) return { data: null, error: error.message, row_count: 0 };
        return { data, error: null, row_count: data?.length ?? 0 };
      }

      case 'query_time_entries': {
        let query = supabase
          .from('time_entries')
          .select('employee_name, qb_customer_id, txn_date, hours, minutes, service_item_name, description, billable_status');

        if (input.employee_name) {
          query = query.ilike('employee_name', `%${input.employee_name}%`);
        }
        if (input.customer_name) {
          query = query.ilike('qb_customer_id', `%${input.customer_name}%`);
        }
        if (input.date_from) {
          query = query.gte('txn_date', input.date_from);
        }
        if (input.date_to) {
          query = query.lte('txn_date', input.date_to);
        }
        if (input.billable_status) {
          query = query.eq('billable_status', input.billable_status);
        }

        query = query.order('txn_date', { ascending: false }).limit(200);
        const { data, error } = await query;
        if (error) return { data: null, error: error.message, row_count: 0 };
        return { data, error: null, row_count: data?.length ?? 0 };
      }

      case 'query_profitability': {
        let query = supabase
          .from('customer_profitability')
          .select('customer_name, week_start, total_hours, billable_hours, billable_revenue, labor_cost, margin, margin_percent');

        if (input.customer_name) {
          query = query.ilike('customer_name', `%${input.customer_name}%`);
        }
        if (input.week_start) {
          query = query.eq('week_start', input.week_start);
        }
        if (input.week_end) {
          query = query.lte('week_start', input.week_end);
        }

        query = query.order('week_start', { ascending: false }).limit(200);
        const { data, error } = await query;
        if (error) return { data: null, error: error.message, row_count: 0 };
        return { data, error: null, row_count: data?.length ?? 0 };
      }

      case 'query_expenses': {
        let query = supabase
          .from('daily_review_transactions')
          .select('vendor_name, txn_date, total_amount, category, qb_account_name, memo')
          .eq('txn_class', 'expense');

        if (input.vendor_name) {
          query = query.ilike('vendor_name', `%${input.vendor_name}%`);
        }
        if (input.category) {
          query = query.ilike('category', `%${input.category}%`);
        }
        if (input.date_from) {
          query = query.gte('txn_date', input.date_from);
        }
        if (input.date_to) {
          query = query.lte('txn_date', input.date_to);
        }

        query = query.order('txn_date', { ascending: false }).limit(200);
        const { data, error } = await query;
        if (error) return { data: null, error: error.message, row_count: 0 };
        return { data, error: null, row_count: data?.length ?? 0 };
      }

      case 'query_payments': {
        let query = supabase
          .from('qb_payments')
          .select('customer_name, txn_date, total_amount, payment_method, payment_ref_num');

        if (input.customer_name) {
          query = query.ilike('customer_name', `%${input.customer_name}%`);
        }
        if (input.date_from) {
          query = query.gte('txn_date', input.date_from);
        }
        if (input.date_to) {
          query = query.lte('txn_date', input.date_to);
        }

        query = query.order('txn_date', { ascending: false }).limit(200);
        const { data, error } = await query;
        if (error) return { data: null, error: error.message, row_count: 0 };
        return { data, error: null, row_count: data?.length ?? 0 };
      }

      case 'query_reports': {
        let query = supabase
          .from('report_periods')
          .select('customer_name, week_start, week_end, status, total_hours, entry_count, sent_at, accepted_at');

        if (input.customer_name) {
          query = query.ilike('customer_name', `%${input.customer_name}%`);
        }
        if (input.status) {
          query = query.eq('status', input.status);
        }
        if (input.week_start) {
          query = query.eq('week_start', input.week_start);
        }

        query = query.order('week_start', { ascending: false }).limit(200);
        const { data, error } = await query;
        if (error) return { data: null, error: error.message, row_count: 0 };
        return { data, error: null, row_count: data?.length ?? 0 };
      }

      case 'query_employees': {
        let query = supabase
          .from('employee_cost_rates')
          .select('employee_name, base_hourly_rate, burden_multiplier, fully_loaded_rate, role, is_active');

        if (input.employee_name) {
          query = query.ilike('employee_name', `%${input.employee_name}%`);
        }
        if (input.is_active !== undefined && input.is_active !== null) {
          query = query.eq('is_active', input.is_active);
        }

        query = query.order('employee_name').limit(200);
        const { data, error } = await query;
        if (error) return { data: null, error: error.message, row_count: 0 };
        return { data, error: null, row_count: data?.length ?? 0 };
      }

      case 'query_customers': {
        let query = supabase
          .from('customers')
          .select('display_name, email, is_active, qb_customer_id');

        if (input.name) {
          query = query.ilike('display_name', `%${input.name}%`);
        }
        if (input.is_active !== undefined && input.is_active !== null) {
          query = query.eq('is_active', input.is_active);
        }

        query = query.order('display_name').limit(200);
        const { data, error } = await query;
        if (error) return { data: null, error: error.message, row_count: 0 };
        return { data, error: null, row_count: data?.length ?? 0 };
      }

      case 'query_daily_review': {
        let query = supabase
          .from('daily_review_transactions')
          .select('qb_entity_type, txn_date, total_amount, vendor_name, review_status, category');

        if (input.review_status) {
          query = query.eq('review_status', input.review_status);
        }
        if (input.date_from) {
          query = query.gte('txn_date', input.date_from);
        }
        if (input.date_to) {
          query = query.lte('txn_date', input.date_to);
        }

        query = query.order('txn_date', { ascending: false }).limit(200);
        const { data, error } = await query;
        if (error) return { data: null, error: error.message, row_count: 0 };
        return { data, error: null, row_count: data?.length ?? 0 };
      }

      case 'query_system_status': {
        // Query schedule_config
        let scheduleQuery = supabase
          .from('schedule_config')
          .select('function_name, display_name, is_paused, schedule_day, schedule_time, last_run_at, last_run_status');

        if (input.function_name) {
          scheduleQuery = scheduleQuery.eq('function_name', input.function_name);
        }

        const { data: schedules, error: schedError } = await scheduleQuery.limit(200);
        if (schedError) return { data: null, error: schedError.message, row_count: 0 };

        // Query recent function_metrics (last 50 runs)
        let metricsQuery = supabase
          .from('function_metrics')
          .select('function_name, started_at, completed_at, duration_ms, status, entries_processed, error_count')
          .order('started_at', { ascending: false });

        if (input.function_name) {
          metricsQuery = metricsQuery.eq('function_name', input.function_name);
        }

        const { data: metrics, error: metricsError } = await metricsQuery.limit(50);
        if (metricsError) return { data: null, error: metricsError.message, row_count: 0 };

        return {
          data: { schedules, recent_metrics: metrics },
          error: null,
          row_count: (schedules?.length ?? 0) + (metrics?.length ?? 0),
        };
      }

      default:
        return { data: null, error: `Unknown tool: ${toolName}`, row_count: 0 };
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { data: null, error: message, row_count: 0 };
  }
}

// ─── System Prompt ───────────────────────────────────────────────────────────

function buildSystemPrompt(): string {
  const today = new Date().toISOString().split('T')[0];

  return `You are the AI assistant for MIT Consulting's timesheet and billing system. Today's date is ${today}.

You help MIT Consulting staff query their business data. Use the provided tools to look up real data before answering. Never fabricate numbers or data -- always query first.

## Formatting Guidelines
- Format currency as USD (e.g., $1,234.56)
- Use markdown tables for tabular data
- Be concise and direct
- When showing dates, use readable formats (e.g., Feb 25, 2026)
- When asked about totals or aggregates, compute them from the returned data

## Important Data Relationships
- In the time_entries table, the column \`qb_customer_id\` contains the **customer display name** (not a numeric ID). Use this column to filter by customer.
- The \`txn_date\` column is the date column in time_entries and invoices.
- Employee hours: the \`hours\` column is the whole hours, \`minutes\` is the additional minutes. Total time = hours + (minutes / 60).
- Invoice status values: Paid, Partial, Open, Overdue.
- Report status values: pending, sent, supplemental_sent, accepted, disputed, no_time.
- Review status values: pending, reviewed, auto_approved, flagged.
- Billable status values: Billable, NonBillable.
- Employee roles: technician, admin, owner.
- fully_loaded_rate = base_hourly_rate * burden_multiplier (auto-computed).
- customer_profitability.margin = billable_revenue - labor_cost; margin_percent is the percentage.

## Available Tables
1. **qb_invoice_balances** - Invoices synced from QuickBooks (invoice_number, customer_name, txn_date, due_date, total_amount, balance, status)
2. **time_entries** - Time logged by employees (employee_name, qb_customer_id [customer name], txn_date, hours, minutes, service_item_name, description, billable_status)
3. **customer_profitability** - Weekly per-customer profitability snapshots (customer_name, week_start, total_hours, billable_hours, billable_revenue, labor_cost, margin, margin_percent)
4. **daily_review_transactions** - Expenses and revenue for daily review (vendor_name, txn_date, total_amount, category, qb_account_name, memo, review_status, txn_class)
5. **qb_payments** - Payments received (customer_name, txn_date, total_amount, payment_method, payment_ref_num)
6. **report_periods** - Weekly customer report tracking (customer_name, week_start, week_end, status, total_hours, entry_count, sent_at, accepted_at)
7. **employee_cost_rates** - Employee pay rates (employee_name, base_hourly_rate, burden_multiplier, fully_loaded_rate, role, is_active)
8. **customers** - Customer reference data (display_name, email, is_active, qb_customer_id)
9. **schedule_config** - Scheduled function settings (function_name, display_name, is_paused, schedule_day, schedule_time, last_run_at, last_run_status)
10. **function_metrics** - Edge function execution metrics (function_name, started_at, completed_at, duration_ms, status, entries_processed, error_count)

If a query returns 200 rows, mention that results may be truncated and suggest narrower filters.`;
}

// ─── Main Handler ────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('🤖 Ask Assistant: Starting...');

    // --- Validate input ---
    const body = await req.json();
    const { question } = body;

    if (!question || typeof question !== 'string' || !question.trim()) {
      return new Response(
        JSON.stringify({ success: false, error: 'A non-empty "question" field is required.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // --- Init clients ---
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const systemPrompt = buildSystemPrompt();

    // --- Tool-use conversation loop ---
    const messages: Array<{ role: string; content: unknown }> = [
      { role: 'user', content: question.trim() },
    ];
    const sources: string[] = [];
    const MAX_TURNS = 5;

    let finalAnswer = '';

    for (let turn = 0; turn < MAX_TURNS; turn++) {
      console.log(`  Turn ${turn + 1}/${MAX_TURNS}...`);

      const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5-20250929',
          max_tokens: 4096,
          system: systemPrompt,
          tools: toolDefinitions,
          tool_choice: { type: 'auto' },
          messages,
        }),
      });

      if (!claudeResponse.ok) {
        const errorText = await claudeResponse.text();
        throw new Error(`Claude API error (${claudeResponse.status}): ${errorText}`);
      }

      const result = await claudeResponse.json();

      // Extract text blocks as answer candidate
      const textBlocks = (result.content || []).filter(
        (b: { type: string }) => b.type === 'text'
      );
      const toolUseBlocks = (result.content || []).filter(
        (b: { type: string }) => b.type === 'tool_use'
      );

      // If the model stopped and there are no tool calls, we are done
      if (result.stop_reason === 'end_turn' || toolUseBlocks.length === 0) {
        finalAnswer = textBlocks.map((b: { text: string }) => b.text).join('\n');
        break;
      }

      // Model wants to call tools -- add assistant message, execute tools, add results
      messages.push({ role: 'assistant', content: result.content });

      const toolResults: Array<{
        type: string;
        tool_use_id: string;
        content: string;
      }> = [];

      for (const block of toolUseBlocks) {
        console.log(`    Tool call: ${block.name}(${JSON.stringify(block.input)})`);

        const toolResult = await executeToolCall(
          supabase,
          block.name,
          block.input as Record<string, unknown>
        );

        // Track which tools were used as sources
        if (!sources.includes(block.name)) {
          sources.push(block.name);
        }

        // Stringify tool result -- truncate if excessively large to stay within token limits
        let resultJson = JSON.stringify(toolResult);
        if (resultJson.length > 100_000) {
          // Truncate the data array if it is too long
          const truncated = {
            ...toolResult,
            data: Array.isArray(toolResult.data)
              ? (toolResult.data as unknown[]).slice(0, 100)
              : toolResult.data,
            _truncated: true,
            _original_row_count: toolResult.row_count,
          };
          resultJson = JSON.stringify(truncated);
        }

        console.log(`    -> ${toolResult.row_count} rows, error=${toolResult.error}`);

        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: resultJson,
        });
      }

      messages.push({ role: 'user', content: toolResults });
    }

    // If we exhausted turns without a final answer, note it
    if (!finalAnswer) {
      finalAnswer =
        'I was unable to complete the analysis within the allowed number of steps. Please try a more specific question.';
    }

    console.log(
      `🤖 Ask Assistant: Done. Sources: [${sources.join(', ')}], answer length: ${finalAnswer.length}`
    );

    return new Response(
      JSON.stringify({
        success: true,
        answer: finalAnswer,
        sources,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    console.error('🤖 Ask Assistant failed:', message);

    return new Response(
      JSON.stringify({
        success: false,
        error: message,
        stack,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
