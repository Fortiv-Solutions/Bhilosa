const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'app', 'projects', '[id]', 'page.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// A function to replace space-separated classes within className="..."
function modifyClasses(str) {
  return str.replace(/className=(["'])(.*?)\1/g, (match, quote, classes) => {
    let classArray = classes.split(/\s+/);
    classArray = classArray.map(cls => {
      // Paddings
      if (cls === 'p-6') return 'p-4';
      if (cls === 'p-5') return 'p-3';
      if (cls === 'p-4') return 'p-3';
      if (cls === 'py-6') return 'py-4';
      if (cls === 'py-5') return 'py-3';
      if (cls === 'py-4') return 'py-2.5';
      if (cls === 'px-6') return 'px-4';
      if (cls === 'px-5') return 'px-4';
      if (cls === 'px-4') return 'px-3';
      if (cls === 'sm:p-4') return 'sm:p-3';
      if (cls === 'lg:p-5') return 'lg:p-4';
      
      // Margins
      if (cls === 'mb-6') return 'mb-4';
      if (cls === 'mb-5') return 'mb-4';
      if (cls === 'mb-4') return 'mb-3';
      if (cls === 'mt-6') return 'mt-4';
      if (cls === 'mt-8') return 'mt-6';
      if (cls === 'mt-4') return 'mt-3';
      
      // Gaps
      if (cls === 'gap-6') return 'gap-4';
      if (cls === 'gap-5') return 'gap-4';
      if (cls === 'gap-4') return 'gap-3';
      if (cls === 'lg:gap-5') return 'lg:gap-4';

      // Border Radius
      if (cls === 'rounded-2xl') return 'rounded-xl';
      if (cls === 'rounded-xl') return 'rounded-lg';

      // Text sizes (be careful not to make things unreadable)
      if (cls === 'text-4xl') return 'text-3xl';
      if (cls === 'text-3xl') return 'text-2xl';
      if (cls === 'text-2xl') return 'text-xl';
      if (cls === 'text-xl') return 'text-lg';
      if (cls === 'text-lg') return 'text-base';
      if (cls === 'text-base') return 'text-[13px]';
      if (cls === 'text-[13px]') return 'text-xs';
      if (cls === 'text-sm') return 'text-xs';

      return cls;
    });
    return `className=${quote}${classArray.join(' ')}${quote}`;
  });
}

const newContent = modifyClasses(content);
fs.writeFileSync(filePath, newContent, 'utf8');
console.log('Successfully updated page.tsx with compact classes');
