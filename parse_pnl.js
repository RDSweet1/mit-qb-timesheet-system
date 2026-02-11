const data = JSON.parse(require('fs').readFileSync('./pnl_report.json','utf8'));
if (!data.success) { console.log('ERROR:', data.error); process.exit(1); }

const report = data.report;
console.log('Report:', report.Header?.ReportName);
console.log('Period:', report.Header?.StartPeriod, 'to', report.Header?.EndPeriod);
console.log('');

function parseRows(rows, depth) {
  if (!rows) return;
  for (const row of rows) {
    const indent = '  '.repeat(depth);
    if (row.Header) {
      const vals = row.Header.ColData?.map(c => c.value) || [];
      console.log(indent + '--- ' + vals[0] + (vals[1] ? ': $' + vals[1] : '') + ' ---');
    }
    if (row.ColData) {
      const vals = row.ColData.map(c => c.value);
      if (vals[0] && vals[0] !== '') {
        console.log(indent + vals[0] + (vals[1] ? ': $' + vals[1] : ''));
      }
    }
    if (row.Rows?.Row) parseRows(row.Rows.Row, depth + 1);
    if (row.Summary) {
      const vals = row.Summary.ColData?.map(c => c.value) || [];
      console.log(indent + '>> ' + vals[0] + (vals[1] ? ': $' + vals[1] : ''));
    }
  }
}

parseRows(report.Rows?.Row, 0);
