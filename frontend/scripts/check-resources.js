const fs = require('fs');
const path = require('path');

function checkJavaResources() {
    const javaServerPath = path.join(__dirname, '..', 'dist', 'java-local-server');
    
    // 检查目录是否存在
    if (!fs.existsSync(javaServerPath)) {
        console.error('Error: java-local-server directory not found!');
        process.exit(1);
    }

    // 检查 JAR 文件
    const hasJar = fs.readdirSync(javaServerPath).some(file => file.endsWith('.jar'));
    if (!hasJar) {
        console.error('Error: No JAR file found in java-local-server directory!');
        process.exit(1);
    }

    // 检查 custom-jre 目录
    const jrePath = path.join(javaServerPath, 'custom-jre');
    if (!fs.existsSync(jrePath)) {
        console.error('Error: custom-jre directory not found!');
        process.exit(1);
    }

    console.log('All required resources are present.');
}

checkJavaResources();
