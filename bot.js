const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const express = require('express');
const axios = require('axios');
const fs = require('fs');

// ================= AYARLAR =================
// Artık şifreleri buraya YAZMIYORUZ! Render'ın gizli kasasından çekeceğiz.
const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID; 
const API_KEY = "12345"; // Roblox'taki key ile aynı (Bu kalabilir)
const PORT = process.env.PORT || 3000;
// ===========================================

// Rütbeleri en yüksekten en düşüğe doğru sıraladık (İlk bulduğunu verir)
const RANKS = [
    "MTA", "OF-10 Mareşal", "Baş Komutan", "Yönetim Kurulu Başkanı", "Yönetim Kurulu Başkan Y",
    "Karargah Yönetimi", "Yönetim Kurulu", "Askeri İdari Kurulu", "Yüksek Askeri Şura", "Askeri Kurultay", "Büyük Konsey",
    "Kıdemli Ordu Generalleri", "Ankara Heyeti", "Orgeneral", "Korgeneral", "Ordu Generalleri",
    "Tümgeneral", "Tuğgeneral", "Albay", "Ordu Subayları", "Yarbay", "Binbaşı", "Yüzbaşı", "Üsteğmen", "Teğmen", "Asteğmen"
];
// ===========================================

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
const app = express();

// Veritabanı dosyası kontrolü
const dbFile = './kayitlar.json';
if (!fs.existsSync(dbFile)) fs.writeFileSync(dbFile, JSON.stringify({}));

// --- EXPRESS API (Roblox Buraya Soracak) ---
app.get('/getRankByRobloxId', async (req, res) => {
    const { robloxId, key } = req.query;
    if (key !== API_KEY) return res.json({ rank: "Sivil" });

    const db = JSON.parse(fs.readFileSync(dbFile));
    const discordId = db[robloxId]; // Roblox ID'ye bağlı Discord ID'yi bul

    if (!discordId) return res.json({ rank: "Sivil" });

    try {
        const guild = client.guilds.cache.get(GUILD_ID);
        const member = await guild.members.fetch(discordId);
        
        let highestRank = "Sivil";
        for (const roleName of RANKS) {
            if (member.roles.cache.some(r => r.name === roleName)) {
                highestRank = roleName;
                break;
            }
        }
        res.json({ rank: highestRank });
    } catch (err) {
        res.json({ rank: "Sivil" });
    }
});

app.listen(PORT, () => console.log(`API ${PORT} portunda açıldı!`));

// --- SLASH KOMUTLARI OLUŞTURMA ---
const commands = [
    new SlashCommandBuilder()
        .setName('kayıt')
        .setDescription('Roblox hesabınızı Discord hesabınızla eşleştirir.')
        .addStringOption(option => option.setName('roblox_ismi').setDescription('Roblox kullanıcı adınız').setRequired(true)),
    new SlashCommandBuilder()
        .setName('sil')
        .setDescription('Belirtilen miktarda mesajı siler.')
        .addIntegerOption(option => option.setName('miktar').setDescription('Silinecek mesaj sayısı (1-100)').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    new SlashCommandBuilder()
        .setName('ban')
        .setDescription('Kullanıcıyı sunucudan yasaklar.')
        .addUserOption(option => option.setName('kullanici').setDescription('Yasaklanacak kişi').setRequired(true))
        .addStringOption(option => option.setName('sebep').setDescription('Yasaklama sebebi'))
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
    new SlashCommandBuilder()
        .setName('timeout')
        .setDescription('Kullanıcıyı susturur (Mute).')
        .addUserOption(option => option.setName('kullanici').setDescription('Susturulacak kişi').setRequired(true))
        .addIntegerOption(option => option.setName('dakika').setDescription('Kaç dakika?').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
].map(command => command.toJSON());

// --- BOT HAZIR OLDUĞUNDA ---
client.once('ready', async () => {
    console.log(`Bot aktif: ${client.user.tag}`);
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    try {
        await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
        console.log('Erensi/Marpel tarzı Slash komutları yüklendi!');
    } catch (error) {
        console.error(error);
    }
});

// --- KOMUT ETKİLEŞİMLERİ ---
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    if (commandName === 'kayıt') {
        const robloxName = interaction.options.getString('roblox_ismi');
        await interaction.deferReply({ ephemeral: true }); // Gizli yanıt bekleme

        try {
            // Roblox API'den kullanıcı ID'sini çek
            const response = await axios.post('https://users.roblox.com/v1/usernames/users', {
                usernames: [robloxName],
                excludeBannedUsers: false
            });

            if (response.data.data.length === 0) {
                return interaction.editReply('❌ Böyle bir Roblox hesabı bulunamadı!');
            }

            const robloxId = response.data.data[0].id.toString();
            const discordId = interaction.user.id;

            // Veritabanına kaydet (robloxId -> discordId şeklinde)
            const db = JSON.parse(fs.readFileSync(dbFile));
            db[robloxId] = discordId; 
            fs.writeFileSync(dbFile, JSON.stringify(db, null, 2));

            const embed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle('✅ Kayıt Başarılı!')
                .setDescription(`Discord hesabınız, **${robloxName}** (ID: ${robloxId}) hesabı ile başarıyla eşleştirildi. Oyuna girdiğinizde yetkiniz otomatik verilecek.`);
            
            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            await interaction.editReply('❌ API Hatası oluştu. Lütfen daha sonra tekrar deneyin.');
        }
    }

    else if (commandName === 'sil') {
        const amount = interaction.options.getInteger('miktar');
        if (amount < 1 || amount > 100) return interaction.reply({ content: '1 ile 100 arasında bir sayı gir!', ephemeral: true });
        
        await interaction.channel.bulkDelete(amount, true).catch(err => {
            return interaction.reply({ content: 'Eski mesajları silemiyorum!', ephemeral: true });
        });
        interaction.reply({ content: `✅ **${amount}** adet mesaj uzaya gönderildi.`, ephemeral: true });
    }

    else if (commandName === 'ban') {
        const target = interaction.options.getUser('kullanici');
        const reason = interaction.options.getString('sebep') || 'Sebep belirtilmedi.';
        const member = interaction.guild.members.cache.get(target.id);
        
        if (!member.bannable) return interaction.reply({ content: '❌ Bu kişiyi banlayamam (Yetkim yetmiyor).', ephemeral: true });
        
        await member.ban({ reason });
        const embed = new EmbedBuilder().setColor(0xFF0000).setDescription(`🔨 **${target.tag}** sunucudan yasaklandı! \nSebep: ${reason}`);
        interaction.reply({ embeds: [embed] });
    }

    else if (commandName === 'timeout') {
        const target = interaction.options.getUser('kullanici');
        const mins = interaction.options.getInteger('dakika');
        const member = interaction.guild.members.cache.get(target.id);
        
        if (!member.moderatable) return interaction.reply({ content: '❌ Bu kişiyi susturamam.', ephemeral: true });
        
        await member.timeout(mins * 60 * 1000);
        const embed = new EmbedBuilder().setColor(0xFFA500).setDescription(`🔇 **${target.tag}**, ${mins} dakika boyunca susturuldu!`);
        interaction.reply({ embeds: [embed] });
    }
});

client.login(TOKEN);
