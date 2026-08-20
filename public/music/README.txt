menu-theme.ogg — active ElevenLabs Music v2 WW2 orchestral menu loop
  (dramatic / tragic MOH–Hidden & Dangerous era war-game atmosphere).
menu-theme-previous.ogg — backup of the theme before the last regeneration.
menu-theme-backup-YYYYMMDD.ogg — dated backup(s) of earlier versions.
menu-theme-original-backup.ogg — earliest procedural/early theme backup.

victory-{faction}.ogg / defeat-{faction}.ogg — short (~18s) match-end stingers
  for germany, usa, uk, russia, japan. German military-band, US 1940s jazz,
  British brass band, Soviet march, Japanese ceremonial/military mix.

Regenerate menu: npm run generate-menu-music -- --force
Regenerate end cues: npm run generate-end-music -- --force
  (optional --only=usa or --only=germany-defeat)
Validate without using credits: npm run generate-menu-music -- --validate
  npm run generate-end-music -- --validate

The menu generator creates a ~90-second instrumental orchestral source and bakes a
four-second end-to-start crossfade into the stereo OGG for seamless menu looping.
End cues are one-shot stingers with a short baked fade-out (not looped).
ELEVENLABS_API_KEY must be supplied through the process environment and is never
written into the repository.
