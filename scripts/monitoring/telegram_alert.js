/**
 * Telegram 告警脚本
 * 
 * 用途：发送告警到 Telegram
 * 配置：在 .env 文件中设置 TELEGRAM_BOT_TOKEN 和 TELEGRAM_CHAT_ID
 */

const axios = require('axios');

class TelegramAlert {
    constructor(botToken, chatId) {
        this.botToken = botToken || process.env.TELEGRAM_BOT_TOKEN;
        this.chatId = chatId || process.env.TELEGRAM_CHAT_ID;
        this.baseUrl = `https://api.telegram.org/bot${this.botToken}`;
    }

    async sendMessage(message, options = {}) {
        if (!this.botToken || !this.chatId) {
            console.log("⚠️ Telegram 未配置，跳过发送");
            console.log("消息内容:", message);
            return;
        }

        try {
            const response = await axios.post(`${this.baseUrl}/sendMessage`, {
                chat_id: this.chatId,
                text: message,
                parse_mode: options.parseMode || 'Markdown',
                disable_web_page_preview: options.disablePreview || true
            });

            console.log("✅ Telegram 消息已发送");
            return response.data;
        } catch (error) {
            console.error("❌ Telegram 发送失败:", error.message);
            throw error;
        }
    }

    async sendAlert(title, details, severity = 'warning') {
        const emoji = {
            critical: '🚨',
            warning: '⚠️',
            info: 'ℹ️',
            success: '✅'
        };

        const message = `
${emoji[severity]} *${title}*

${details}

_时间: ${new Date().toISOString()}_
        `.trim();

        return this.sendMessage(message);
    }

    async sendHealthReport(report) {
        const status = report.status === 'healthy' ? '✅ 健康' : '🚨 异常';
        
        let message = `
📊 *DIAP 健康检查报告*

状态: ${status}
网络: ${report.network}
时间: ${report.timestamp}

📈 *关键指标*
• 总供应量: ${report.metrics.totalSupply} DIAP
• 合约余额: ${report.metrics.contractBalance} DIAP
• 总质押量: ${report.metrics.totalStaked} DIAP
• 质押率: ${report.metrics.stakingRatio.toFixed(2)}%
• 智能体数: ${report.metrics.totalAgents}
• Gas 价格: ${report.metrics.gasPrice} Gwei
        `.trim();

        if (report.alerts && report.alerts.length > 0) {
            message += '\n\n🚨 *严重告警*\n';
            report.alerts.forEach(alert => {
                message += `• ${alert}\n`;
            });
        }

        if (report.warnings && report.warnings.length > 0) {
            message += '\n\n⚠️ *警告*\n';
            report.warnings.forEach(warning => {
                message += `• ${warning}\n`;
            });
        }

        return this.sendMessage(message);
    }

    async sendEmergencyAlert(action, contracts) {
        const message = `
🚨 *紧急操作执行*

操作: ${action}
时间: ${new Date().toISOString()}

受影响的合约:
${contracts.map(c => `• ${c}`).join('\n')}

⚠️ 请立即检查系统状态！
        `.trim();

        return this.sendMessage(message);
    }
}

// 使用示例
async function example() {
    const alert = new TelegramAlert();
    
    // 发送简单消息
    await alert.sendMessage("测试消息");
    
    // 发送告警
    await alert.sendAlert(
        "合约余额不足",
        "DIAPToken 合约余额低于阈值\n当前余额: 50,000 DIAP\n建议余额: 100,000 DIAP",
        "warning"
    );
    
    // 发送健康报告
    const report = {
        status: "healthy",
        network: "sepolia",
        timestamp: new Date().toISOString(),
        metrics: {
            totalSupply: "100000000",
            contractBalance: "8000000",
            totalStaked: "5000000",
            stakingRatio: 5.0,
            totalAgents: "150",
            gasPrice: "25"
        },
        alerts: [],
        warnings: []
    };
    await alert.sendHealthReport(report);
}

module.exports = TelegramAlert;

// 如果直接运行，执行示例
if (require.main === module) {
    example()
        .then(() => console.log("✅ 示例执行完成"))
        .catch(error => console.error("❌ 示例执行失败:", error));
}
