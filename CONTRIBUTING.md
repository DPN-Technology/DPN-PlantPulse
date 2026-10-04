# Contributing to DPN PlantPulse

PlantPulse is built as a TypeScript-first mobile application.

## Local development

1. Install Node.js 22.13+.
2. Run `npm install`.
3. Run `npm run typecheck`.
4. Run `npm start`.
5. Open the app with Expo Go or a development build.

## Pull request standard

Every PR should:

- explain the user-visible change
- avoid mixing unrelated refactors
- pass the Mobile Quality Gate
- keep CodeQL green
- contain no credentials or private production configuration
- clearly label prototype/mock intelligence versus production AI behavior
- preserve confidence and safety language for uncertain plant-health conclusions

## Product rule

Do not build PlantPulse as a cosmetic clone of another plant-identification application. Features may solve similar user needs, but DPN PlantPulse should maintain its own health-scoring, longitudinal intelligence, visual system, data model, workflows, and product direction.
