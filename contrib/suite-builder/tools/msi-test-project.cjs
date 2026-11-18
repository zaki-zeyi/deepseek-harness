const fs = require('node:fs');

// Keep experimental MSI installations out of the existing NSIS installation folder.
exports.default = function msiProjectCreated(file) {
  let xml = fs.readFileSync(file, 'utf8');
  const folderProperty = /(<Property Id="ApplicationFolderName" Value=")[^"]+("\/?>)/;
  const folderDirectory = /(<Directory Id="APPLICATIONFOLDER" Name=")[^"]+("\/?>)/;
  if (!folderProperty.test(xml) || !folderDirectory.test(xml)) throw new Error('Unexpected MSI directory template');
  xml = xml.replace(folderProperty, '$1DSH-MSI-Test$2').replace(folderDirectory, '$1DSH-MSI-Test$2');
  fs.writeFileSync(file, xml);
};
