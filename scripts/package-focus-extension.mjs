import fs from 'node:fs';
const names=['manifest.json','background.js','content.js','blocked.html','blocked.js','INSTALL.txt'];
const crc=bytes=>{let value=0xffffffff;for(const byte of bytes){value^=byte;for(let bit=0;bit<8;bit++)value=(value>>>1)^((value&1)?0xedb88320:0);}return (value^0xffffffff)>>>0;};
const files=[],directory=[];let offset=0;
for(const name of names){
  const label=Buffer.from(name),data=fs.readFileSync(new URL(`../browser-extension/noviq-focus/${name}`,import.meta.url));
  if(data.length>1024*1024)throw new Error('Unexpected extension package size.');
  const checksum=crc(data),header=Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50,0);header.writeUInt16LE(20,4);header.writeUInt16LE(0x800,6);header.writeUInt16LE(33,12);header.writeUInt32LE(checksum,14);header.writeUInt32LE(data.length,18);header.writeUInt32LE(data.length,22);header.writeUInt16LE(label.length,26);
  files.push(header,label,data);
  const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(0x800,8);central.writeUInt16LE(33,14);central.writeUInt32LE(checksum,16);central.writeUInt32LE(data.length,20);central.writeUInt32LE(data.length,24);central.writeUInt16LE(label.length,28);central.writeUInt32LE(offset,42);
  directory.push(central,label);offset+=header.length+label.length+data.length;
}
const central=Buffer.concat(directory),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(names.length,8);end.writeUInt16LE(names.length,10);end.writeUInt32LE(central.length,12);end.writeUInt32LE(offset,16);
fs.writeFileSync(new URL('../public/noviq-focus-extension.zip',import.meta.url),Buffer.concat([...files,central,end]));
console.log('Packaged NOVIQ Focus extension (6 source files, no credentials).');
