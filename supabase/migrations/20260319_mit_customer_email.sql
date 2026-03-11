-- Set email on MIT internal customer records so they receive all reports
-- Both records (id=2 qb_customer_id='212', id=26 qb_customer_id='Mitigation Information Technologies')
-- were previously email=null, causing send-reminder/follow-up/auto-accept to skip them

UPDATE customers
SET email = 'accounting@mitigationconsulting.com'
WHERE is_internal = true
  AND email IS NULL;
