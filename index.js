import { Client, GatewayIntentBits, Partials, Routes, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, InteractionType, PermissionsBitField } from 'discord.js';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { REST } from '@discordjs/rest';

dotenv.config();

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
  partials: [Partials.Channel]
});

const roles = {
  "exclusive-access": "1309964451025391646",
  "full-access": "1309964453403557920",
  "half-access": "1309964460177363005"
};

const shirtIDs = {
  "exclusive-access": "135228117983216",
  "full-access": "93281202894558",
  "half-access": "90784589610250"
};

const commands = [
  {
    name: "exclusive-access",
    description: "Check exclusive access shirt ownership"
  },
  {
    name: "full-access",
    description: "Check full access shirt ownership"
  },
  {
    name: "half-access",
    description: "Check half access shirt ownership"
  }
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

async function registerCommands() {
  try {
    console.log('Started refreshing application (/) commands.');

    await rest.put(
      Routes.applicationGuildCommands(client.user.id, process.env.GUILD_ID),
      { body: commands }
    );

    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error(error);
  }
}

// Convert Roblox username to userId
async function getUserId(username) {
  const res = await fetch(`https://api.roblox.com/users/get-by-username?username=${encodeURIComponent(username)}`);
  const data = await res.json();
  if (data && data.Id) return data.Id;
  return null;
}

// Check if user owns shirtId in inventory (wearable shirts are usually in assets)
async function ownsShirt(userId, shirtId) {
  // Roblox inventory API endpoint for assets by userId
  // We'll fetch all assets, filtering by type 11 (shirt) for speed
  const url = `https://inventory.roblox.com/v1/users/${userId}/assets/collectibles?assetType=Shirt`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (!data || !data.data) return false;
    return data.data.some(asset => asset.assetId.toString() === shirtId);
  } catch {
    return false;
  }
}

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}!`);
  await registerCommands();
});

client.on('interactionCreate', async interaction => {
  if (interaction.isChatInputCommand()) {
    const command = interaction.commandName;

    if (!roles[command]) {
      return interaction.reply({ content: 'Unknown command!', ephemeral: true });
    }

    // Show modal to get Roblox username
    const modal = new ModalBuilder()
      .setCustomId(`roblox_username_modal_${command}`)
      .setTitle('Enter your Roblox username');

    const usernameInput = new TextInputBuilder()
      .setCustomId('username_input')
      .setLabel("Roblox Username")
      .setStyle(TextInputStyle.Short)
      .setMinLength(3)
      .setMaxLength(20)
      .setPlaceholder('Your Roblox username')
      .setRequired(true);

    const firstActionRow = new ActionRowBuilder().addComponents(usernameInput);
    modal.addComponents(firstActionRow);

    await interaction.showModal(modal);
  }
  else if (interaction.type === InteractionType.ModalSubmit) {
    if (!interaction.customId.startsWith('roblox_username_modal_')) return;

    await interaction.deferReply({ ephemeral: true });

    const command = interaction.customId.replace('roblox_username_modal_', '');
    const username = interaction.fields.getTextInputValue('username_input');

    const userId = await getUserId(username);

    if (!userId) {
      return interaction.editReply({ content: `Could not find Roblox user **${username}**.` });
    }

    const shirtId = shirtIDs[command];
    const roleId = roles[command];

    if (!shirtId || !roleId) {
      return interaction.editReply({ content: `Configuration error for command ${command}.` });
    }

    const owns = await ownsShirt(userId, shirtId);
    if (!owns) {
      return interaction.editReply({ content: `User **${username}** does NOT own the required shirt.` });
    }

    // Assign role
    const guild = client.guilds.cache.get(process.env.GUILD_ID);
    if (!guild) return interaction.editReply({ content: `Guild not found.` });

    const member = await guild.members.fetch(interaction.user.id);
    if (!member) return interaction.editReply({ content: `Member not found in guild.` });

    if (member.roles.cache.has(roleId)) {
      return interaction.editReply({ content: `You already have the role!` });
    }

    try {
      await member.roles.add(roleId);
      return interaction.editReply({ content: `Role assigned successfully!` });
    } catch (error) {
      console.error(error);
      return interaction.editReply({ content: `Failed to assign role. Do I have permission?` });
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
