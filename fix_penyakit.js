const fs = require('fs');
let c = fs.readFileSync('frontend/app/penyakit/page.tsx', 'utf8');

// Find the end of the new clean array (first ]; after Anggur - Sehat)
const cleanEnd = c.indexOf('];\n    id: 1, label: "Apple - Black Rot"');
if (cleanEnd === -1) {
  console.log('Pattern not found. Searching for duplicate data...');
  // Try to find where the old data starts after the new array closes
  const idx = c.indexOf('  id: 1, label: "Apple - Black Rot"');
  console.log('Old Apple Black Rot at index:', idx);
  // Show surrounding context
  console.log(c.slice(Math.max(0,idx-20), idx+100));
} else {
  // Cut everything between ];\n and \nconst PLANTS
  const afterBracket = c.indexOf('\nconst PLANTS', cleanEnd);
  const fixed = c.slice(0, cleanEnd + 2) + c.slice(afterBracket);
  fs.writeFileSync('frontend/app/penyakit/page.tsx', fixed);
  console.log('Fixed! Lines:', fixed.split('\n').length);
}
