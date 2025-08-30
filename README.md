# OneNoteBot

A Discord bot for OneNote integration and server management with comprehensive moderation commands.

## Features

- **General Commands**: Ping, help, user info, server info
- **Moderation Commands**: Clear messages, kick, ban, mute, unmute users
- **Role-based Permissions**: Moderation commands require specific role permissions

## Commands

### General Commands
- `/ping` - Check if the bot is responsive
- `/help` - Display all available commands with descriptions
- `/userinfo [user]` - Get detailed information about a user (defaults to command user)
- `/serverinfo` - Get comprehensive server information

### Moderation Commands (Requires Mod Role)
- `/clear <amount>` - Clear 1-100 messages from the current channel
- `/kick <user> [reason]` - Kick a user from the server with optional reason
- `/ban <user> [reason]` - Ban a user from the server with optional reason
- `/mute <user> [duration]` - Mute a user for specified minutes (default: 10 minutes)
- `/unmute <user>` - Remove timeout from a muted user

## Setup

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Environment Configuration**
   Create a `.env` file with the following variables:
   ```
   DISCORD_TOKEN=your_bot_token
   CLIENT_ID=your_client_id
   APP_ID=your_app_id
   PUBLIC_SERVER_ID=your_public_server_id
   PRIVATE_SERVER_ID=your_private_server_id
   MOD_ROLE_ID=your_moderator_role_id
   ```

3. **Run the Bot**
   ```bash
   npm start
   ```

   For development with auto-restart:
   ```bash
   npm run dev
   ```

## Bot Permissions

The bot requires the following Discord permissions:
- Send Messages
- Use Slash Commands
- Manage Messages (for clear command)
- Kick Members
- Ban Members
- Moderate Members (for mute/unmute)
- Read Message History
- View Channels

## Server Configuration

- **Public Server**: Commands available to all users (general commands only)
- **Private Server**: Full command access for authorized users
- **Mod Role**: Required for moderation commands (kick, ban, mute, clear)

## Development

The bot uses Discord.js v14 and supports:
- Slash commands with proper error handling
- Role-based permission checking
- Multi-server deployment
- Automatic command registration

## License

MIT License - See LICENSE file for details
