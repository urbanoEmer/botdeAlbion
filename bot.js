// Importa las clases necesarias desde discord.js y axios
const { Client, GatewayIntentBits, REST, Routes } = require('discord.js');
const axios = require('axios');

// Usa las variables de entorno
const token = 'MTI4OTMwNDI2ODMxNDEyMDIyMw.GI4Wui.4zVXrnKOY7AMxWminX9VbmfJIFBZMZphnLRbIc';
const CLIENT_ID = '1289304268314120223'; // ID de tu aplicación
const GUILD_ID = '907873244281970698';   // ID de tu servidor

// Crea una nueva instancia de cliente de Discord
const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent 
    ] 
});

// Constantes de configuración
let reportChannelId = null;
let reportEnabled = false;

// Función para registrar comandos
async function registerCommands() {
    const commands = [
        {
            name: 'setchannel',
            description: 'Configura el canal para los reportes',
            options: [
                {
                    type: 7, // Tipo 7 es para canal
                    name: 'channel',
                    description: 'Selecciona un canal',
                    required: true,
                }
            ],
        },
        {
            name: 'shadowbot',
            description: 'Activa o desactiva el bot de reportes',
            options: [
                {
                    type: 5, // Tipo 5 es para booleano
                    name: 'enable',
                    description: 'Activar o desactivar el bot',
                    required: true,
                }
            ],
        }
    ];

    const rest = new REST({ version: '9' }).setToken(token);

    try {
        console.log('Comandos en registro...');
        await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
        console.log('Comandos registrados correctamente.');
    } catch (error) {
        console.error(error);
    }
}

// Función para obtener y enviar el reporte
async function checkBattles() {
    if (!reportEnabled) return; // No hacer nada si el bot no está habilitado

    try {
        const response = await axios.get('https://albionbattles.com/api/battles');
        const battles = response.data;

        for (const battle of battles) {
            const totalFights = battle.kills.length; // Total de muertes en la batalla
            if (totalFights > 10) { // Más de 5v5
                const guildReports = battle.kills.reduce((acc, kill) => {
                    // Agrupa kills y deaths por gremio
                    if (!acc[kill.guildId]) {
                        acc[kill.guildId] = { kills: 0, deaths: 0, players: {} };
                    }
                    acc[kill.guildId].kills += 1;

                    // Contar las muertes (esto se supone que tienes acceso a la información de las muertes)
                    if (kill.isDeath) {
                        acc[kill.guildId].deaths += 1;
                    }

                    // Guarda el daño por jugador
                    if (!acc[kill.guildId].players[kill.playerName]) {
                        acc[kill.guildId].players[kill.playerName] = { kills: 0, deaths: 0, damage: 0, healing: 0 };
                    }
                    acc[kill.guildId].players[kill.playerName].kills += 1; // Incrementa kills
                    acc[kill.guildId].players[kill.playerName].damage += kill.damage || 0; // Asegúrate de que 'damage' esté definido

                    return acc;
                }, {});

                // Crear la tabla para el reporte
                let reportMessage = `**Batalla: ${battle.id}**\n**Fecha: ${battle.timestamp}**\n\n`;

                // Procesar y mostrar la información por gremio
                for (const [guildId, stats] of Object.entries(guildReports)) {
                    reportMessage += `**Guild**: ${guildId}\n`;
                    reportMessage += `Kills: ${stats.kills}\n`;
                    reportMessage += `Deaths: ${stats.deaths}\n\n`;
                }

                // Obtener el jugador con más kills y el que curó más
                let maxKillsPlayer = '';
                let maxKills = 0;
                let maxHealingPlayer = '';
                let maxHealing = 0;

                for (const guild of Object.values(guildReports)) {
                    for (const [playerName, playerStats] of Object.entries(guild.players)) {
                        if (playerStats.kills > maxKills) {
                            maxKills = playerStats.kills;
                            maxKillsPlayer = playerName;
                        }
                        if (playerStats.healing > maxHealing) {
                            maxHealing = playerStats.healing;
                            maxHealingPlayer = playerName;
                        }
                    }
                }

                // Agregar información del jugador con más kills y el que curó más
                reportMessage += `**Jugador con más kills:** ${maxKillsPlayer} (${maxKills} kills)\n`;
                reportMessage += `**Jugador que curó más:** ${maxHealingPlayer} (${maxHealing} curaciones)\n`;

                // Mostrar el nombre del jugador que hizo la donación más alta
                const donations = battle.donations || []; // Suponiendo que tienes esta información en la API
                let highestDonationPlayer = '';
                let highestDonationAmount = 0;

                donations.forEach(donation => {
                    if (donation.amount > highestDonationAmount) {
                        highestDonationAmount = donation.amount;
                        highestDonationPlayer = donation.playerName;
                    }
                });

                reportMessage += `**Jugador con la donación más alta:** ${highestDonationPlayer} (${highestDonationAmount} plata)\n`;

                // Envía el mensaje al canal configurado
                if (reportChannelId) {
                    const channel = await client.channels.fetch(reportChannelId);
                    if (channel) {
                        await channel.send(reportMessage);
                    } else {
                        console.error(`El canal con ID ${reportChannelId} no se encontró.`);
                    }
                } else {
                    console.error("No se ha configurado un canal para los reportes.");
                }
            }
        }
    } catch (error) {
        console.error('Error fetching battles:', error);
    }
}

// Manejo de comandos slash
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand()) return;

    const { commandName } = interaction;

    if (commandName === 'setchannel') {
        reportChannelId = interaction.options.getChannel('channel').id;
        await interaction.reply(`Canal de reportes configurado en <#${reportChannelId}>`);
    } else if (commandName === 'shadowbot') {
        reportEnabled = interaction.options.getBoolean('enable');
        await interaction.reply(`Bot de reportes ${reportEnabled ? 'activado' : 'desactivado'}.`);
    }
});

// Iniciar el bot y registrar comandos
client.once('ready', () => {
    console.log('Bot is online!');
    registerCommands();
    setInterval(checkBattles, 300000); // Verificar cada 5 minutos
});

// Iniciar sesión en Discord
client.login(token);