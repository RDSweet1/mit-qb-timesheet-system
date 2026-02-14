-- Add structure insurance and accounting fees to overhead
INSERT INTO overhead_line_items (category, vendor, annual_amount, frequency, notes) VALUES
  ('Insurance', 'True/Progressive (structure)', 7500, 'annual', 'User estimate: ~$7,500/yr property/structure insurance'),
  ('Accounting', 'Durkin and Durkin', 2400, 'annual', 'User estimate: ~$2,400/yr accounting fees');
