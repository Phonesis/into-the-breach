menu-theme.ogg — original ElevenLabs Music v2 WW2 orchestral menu loop.
menu-theme-original-backup.ogg — exact backup of the previous 64-second
procedurally synthesized menu theme.

Regenerate: npm run generate-menu-music -- --force
Validate without using credits: npm run generate-menu-music -- --validate

The generator creates an 80-second instrumental orchestral source and bakes a
four-second end-to-start crossfade into the stereo OGG for seamless menu looping.
ELEVENLABS_API_KEY must be supplied through the process environment and is never
written into the repository.
