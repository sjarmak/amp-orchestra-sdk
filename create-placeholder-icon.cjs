// Simple SVG to PNG placeholder icon generator
const fs = require('fs');

const svgIcon = `
<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <rect width="1024" height="1024" fill="#ffffff" rx="180"/>
  
  <!-- Background cards in red -->
  <g transform="translate(150, 200)">
    <!-- Back card -->
    <rect x="40" y="40" width="400" height="280" rx="12" fill="#ff4444" opacity="0.7"/>
    
    <!-- Middle card -->  
    <rect x="20" y="20" width="400" height="280" rx="12" fill="#ff3333" opacity="0.8"/>
    
    <!-- Front card -->
    <rect x="0" y="0" width="400" height="280" rx="12" fill="#ff2222"/>
    
    <!-- Arrow indicator -->
    <path d="M 350 320 L 420 320 L 420 340 L 480 310 L 420 280 L 420 300 L 350 300 Z" fill="#ff2222"/>
  </g>
</svg>
`;

fs.writeFileSync('icon-placeholder.svg', svgIcon);
console.log('Created icon-placeholder.svg - you can convert this to PNG or replace with your actual icon');
