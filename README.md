# ErinHelperDiscordBot

A comprehensive Discord bot designed for coding help communities, featuring automated support responses, fun commands, and server administration tools.

## Features

- **Help & Support Commands**: Automated responses for common coding questions and community guidelines
- **Fun & Entertainment**: Interactive games, jokes, trivia, and entertainment commands
- **Admin & Moderation**: Server management tools for administrators and moderators
- **Community Guidelines**: Built-in responses to promote good question-asking practices
- **Database Integration**: SQLite database for persistent data storage

## Commands

### Help & Support Commands
- `/justask <user>` - Reminds users to ask their question directly instead of asking if anyone can help
- `/share-code [user]` - Provides guidance on properly formatting and sharing code
- `/format [user]` - Explains proper code formatting with backticks
- `/error [user]` - Guides users on how to properly share error messages
- `/elaborate [user]` - Encourages users to provide more details about their problem
- `/patience [user]` - Reminds users to be patient while waiting for help
- `/gettinganswers [user]` - Tips for getting better responses to coding questions
- `/rules [user]` - Links to server rules and community guidelines
- `/faq` - Frequently asked questions about coding and the server

### Fun & Entertainment Commands
- `/8ball <question>` - Ask the magic 8-ball a question
- `/joke` - Get a random programming joke
- `/fact` - Random interesting fact
- `/trivia` - Programming trivia questions
- `/dice [sides]` - Roll dice (default 6-sided)
- `/flip` - Flip a coin
- `/choose <options>` - Choose between multiple options
- `/rps <choice>` - Play rock, paper, scissors
- `/compliment [user]` - Give someone a compliment
- `/roast [user]` - Playfully roast someone
- `/meme` - Get a random programming meme
- `/riddle` - Get a programming riddle
- `/quote` - Inspirational programming quote

### Admin Commands (Requires Admin Role)
- `/access <user>` - Manage user access permissions
- `/boosters` - Manage server booster benefits
- `/welcome` - Configure welcome messages
- `/server-rules` - Manage server rules display
- `/clear-suggs` - Clear suggestion channels

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
   ```

3. **Run the Bot**
   ```bash
   node index.js
   ```

   For production with PM2:
   ```bash
   pm2 start ecosystem.config.js
   ```

## Bot Permissions

The bot requires the following Discord permissions:
- Send Messages
- Use Slash Commands
- Send Messages in Threads
- Create Public Threads
- Send Direct Messages
- Read Message History
- View Channels
- Use External Emojis
- Add Reactions

## Features & Usage

### Community Helper Features
- **Automated Support**: Provides consistent, helpful responses to common questions
- **Question Quality**: Encourages users to ask better questions with proper formatting
- **Code Sharing**: Guides users on proper code formatting and sharing practices
- **Community Standards**: Reinforces server rules and etiquette automatically

### Entertainment & Engagement
- **Interactive Games**: Keep community members engaged with fun activities
- **Programming Humor**: Jokes, memes, and quotes relevant to developers
- **Trivia & Learning**: Educational content to help users learn while having fun

## Development

The bot uses Discord.js v14.21.0 and features:
- Modular command structure with separate folders for different command types
- SQLite database integration for persistent data storage
- Automatic command loading and registration
- Event-driven architecture with proper error handling
- Rate limiting protection and ghost ping detection

## License

MIT License - See LICENSE file for details
