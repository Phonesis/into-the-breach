menu-theme.ogg — active ElevenLabs Music v2 WW2 orchestral menu loop
  (dramatic / tragic MOH–Hidden & Dangerous era war-game atmosphere).
menu-theme-previous.ogg — backup of the theme before the last regeneration.
menu-theme-backup-YYYYMMDD.ogg — dated backup(s) of earlier versions.
menu-theme-original-backup.ogg — earliest procedural/early theme backup.

Regenerate: npm run generate-menu-music -- --force
Validate without using credits: npm run generate-menu-music -- --validate

The generator creates a ~90-second instrumental orchestral source and bakes a
four-second end-to-start crossfade into the stereo OGG for seamless menu looping.
ELEVENLABS_API_KEY must be supplied through the process environment and is never
written into the repository.
