import {
  CareerStatus,
  Demand,
  OutlookType,
  Prisma,
  PrismaClient,
  ResourceCostStatus,
  ResourceStatus,
  ResourceType,
  TargetLevel,
} from '../src/generated/prisma/client';

type OutlookRow = Omit<Prisma.OutlookDataCreateManyInput, 'careerId'>;

interface StepSeed {
  title: string;
  description: string;
  learningObjective: string;
  prerequisites: string | null;
  expectedActivity: string;
  skills: string[];
  resources: string[];
}

interface CareerSeed {
  slug: string;
  title: string;
  description: string;
  roleSummary: string;
  exampleActivities: string[];
  typicalEducationNote: string | null;
  certificationsNote: string | null;
  targetLevels: TargetLevel[];
  status: CareerStatus;
  field: string;
  skills: string[];
  outlook: OutlookRow[];
  pathway?: {
    title: string;
    description: string;
    steps: StepSeed[];
  };
}

interface ResourceSeed {
  id: string;
  title: string;
  description: string;
  url: string;
  type: ResourceType;
  provider: string;
  costStatus: ResourceCostStatus;
  certificationCost: string | null;
  curationRationale: string;
  status: ResourceStatus;
  skills: string[];
}

const LAST_CHECKED = new Date('2026-09-25T00:00:00.000Z');

const PUBLISHED_AT = new Date('2026-09-25T00:00:00.000Z');

const FIELDS = [
  { slug: 'software-engineering', name: 'Software Engineering' },
  { slug: 'data-analytics', name: 'Data & Analytics' },
  { slug: 'design', name: 'Design' },
  { slug: 'cloud-infrastructure', name: 'Cloud & Infrastructure' },
];

const SKILLS = [
  {
    name: 'JavaScript',
    description: 'The language of the web, running in browsers and on servers',
  },
  { name: 'HTML & CSS', description: 'Structure and styling for web pages' },
  {
    name: 'React',
    description: 'Component-based library for building user interfaces',
  },
  {
    name: 'Git',
    description: 'Version control for tracking and sharing code changes',
  },
  {
    name: 'SQL',
    description: 'Querying and joining data in relational databases',
  },
  {
    name: 'Excel',
    description: 'Spreadsheet analysis with formulas, pivot tables and charts',
  },
  {
    name: 'Python',
    description: 'General-purpose language widely used for data work',
  },
  {
    name: 'Data Visualization',
    description: 'Presenting data clearly with charts and dashboards',
  },
  {
    name: 'Figma',
    description: 'Collaborative interface design and prototyping tool',
  },
  {
    name: 'User Research',
    description: 'Learning what users need through interviews and testing',
  },
  {
    name: 'UX Principles',
    description: 'Design heuristics grounded in how people perceive and act',
  },
  {
    name: 'Prototyping',
    description: 'Building clickable mock-ups to test ideas before development',
  },
  {
    name: 'Test Design',
    description: 'Deriving test cases that cover requirements and edge cases',
  },
  {
    name: 'Test Automation',
    description: 'Scripting repeatable checks that run on every change',
  },
  {
    name: 'API Testing',
    description: 'Verifying API requests, responses and error handling',
  },
  {
    name: 'Linux',
    description: 'Working with servers from the command line',
  },
  {
    name: 'Docker',
    description: 'Packaging applications into portable containers',
  },
  {
    name: 'Cloud Fundamentals',
    description:
      'Core cloud concepts: compute, storage, networking and pricing',
  },
];

const RESOURCE = {
  // Existing
  typescriptHandbook: '730b06cc-81dd-41b4-93f9-f51280efc942',
  nestFirstSteps: '8351e136-5b98-4c54-920d-b5153d63bdfd',
  prismaGettingStarted: 'b446ca08-6baf-4fdd-a289-a039664a6221',
  mdnLearnWeb: '2795f0f9-c291-4a1a-b842-55343adbdeb4',
  freeCodeCampJs: 'd29c02f4-a5f6-4353-bc21-f5dd7e4824b2',
  reactQuickStart: '6da45201-b243-4027-bbb6-02c602df5bc9',
  createReactApp: '93270e84-b476-40a6-8b82-575c4878f71b',
  proGit: '9228b547-a0b3-47c0-a39f-2ec7d15dc458',
  excelHelp: '222e5597-588b-4de4-8679-5970edc7537c',
  sqlBolt: '8a0f3441-193b-414e-b257-60a6a984c5df',
  pythonForEverybody: '931eee77-6054-48a9-adca-99f4d5e964e9',
  storytellingWithData: 'b8022a89-1581-4d1e-b893-84307ee0f966',
  lawsOfUx: '123680e9-7b60-41cc-a98a-6774a4b3ba23',
  userInterviews: 'a7d07f1c-3b4f-45e7-a8a9-8458a9e9edbd',
  figmaGetStarted: '14460443-679c-4f78-bbb5-25128818c561',
  istqbFoundation: '4ebd8d98-cf93-40e2-96ee-83ecfba7e51f',
  playwrightIntro: '850a6eb4-5860-465e-9712-9ea8821bd3e4',
  postmanQuickStart: '1b1cc57f-47b1-417f-b216-d1e8149452c6',
  linuxCommandLine: '0e937659-eb10-44dc-8bef-80809cf2e67e',
  dockerGetStarted: '10b50908-9fbc-40a2-b142-7d5b3e5a403f',
  awsCloudPractitioner: '1cd28269-192a-4edf-b0db-4b79d63c9fb3',

  // Frontend
  webDevLearnHtml: '266572b7-33d8-4273-9d88-333b0e37823f',
  webDevLearnCss: '578f4b56-ea24-4932-aec7-ffae134dec90',
  flexboxGuide: 'a499f6a1-5461-45d3-8c0a-5f03a9fee762',
  flexboxFroggy: 'bebd1080-ef2e-4893-b244-c2c657f9fe2c',
  javascriptInfo: '5b60c8f0-d619-4367-9abe-4fb25ade3e31',
  mdnFetchApi: 'bcc34612-383e-4797-aed9-0e8f18318f58',
  eloquentJs: '2a490b75-9202-4d2b-899b-409dd3f17c10',
  githubSkills: '32b49616-ae67-44e3-a66f-a8ce0f11d706',
  reactTypescriptCheatsheets: '8be80d23-3086-4942-8657-9699cdb011df',
  viteGuide: 'ca416fb9-23e6-4eeb-9283-bcb3ad8c67ba',

  // Data
  exceljet: 'a3485f36-d262-4fe9-af35-790c7583fede',
  excelEasy: '21efb39f-45d2-446c-ab09-a4ed169ffa3c',
  sqlZoo: 'c9d7ecd5-9cfe-41ba-811c-a39bb85cc16f',
  kaggleIntroSql: 'f80229d3-2ddf-4c00-8099-e9befe6b44af',
  kaggleIntroPython: 'c7335123-3da8-4274-9ecb-6c8a76014300',
  kaggleDataViz: '590b234b-9a28-4dc3-add8-424a269d53a0',
  dataToViz: 'f2f20c04-4921-41e9-a752-3b8ab171d7a4',
  powerBiGuidedLearning: 'b91bc5b7-ee8a-4544-8c5b-7ab532c6563e',

  // Design
  nngHeuristics: 'f5d0aa54-fcb8-45c4-95b3-717b76eff951',
  material3: 'cde4b13f-1bd8-41c4-ae60-48d5ce07d740',
  usabilityTesting101: '79aa741d-7390-4a15-affc-3792c873359e',
  designKitFieldGuide: '03b5f4b7-b931-4a82-b0dc-b92613b525e6',
  figmaPrototyping: '4e153f12-15b3-4f18-9469-9d8cb6b2b969',
  googleUxCertificate: '80fb3cd5-65e3-414f-b603-cc41193d8c99',

  // QA
  guru99Testing: 'a5a98cda-656d-42d8-8cac-d0d5f266bd96',
  ministryOfTesting: 'd6dfffbb-5cfa-4556-a241-8403ef030ff8',
  playwrightBestPractices: '404e1172-d1fa-44dd-a9a3-22b39f6a1ffd',
  testAutomationUniversity: '096db6bc-bfb7-46a2-9a18-f10d3a7461f1',
  mdnHttpOverview: '75a8d933-c644-4570-95e2-c548262d5a4c',
  mdnHttpStatus: '0e7de679-7f67-4bea-be3b-3cd6779fe26a',
  postmanTestScripts: 'e5bf032e-df46-4901-b258-bef914a23d8c',

  // Cloud
  linuxJourney: '88529053-d8c3-432d-81ae-90fe3976f703',
  overTheWireBandit: 'e87c5ccf-2a00-4d64-92ab-3c507abfd41f',
  dockerCompose: '5762a92b-3469-447b-9297-bccabedff7c9',
  dockerfileBestPractices: '96fe5228-5237-4def-97b7-c4a133b71bb6',
  playWithDocker: '152c7248-1c9f-4b51-93c8-aee9bf290919',
  awsCloudPractitionerTraining: 'b675af32-978a-42c2-80eb-dabf04104827',
  awsPricingCalculator: '9c50ae9a-1b74-4ba1-99d7-e1dc5c933799',
  awsWellArchitected: '9191cf0a-1b23-411e-b3eb-6db8e3e42fe9',

  // Backend (pathway seeded elsewhere)
  typescriptIn5Minutes: '6450a5b5-0c5e-4100-959c-7bdfd201afb2',
  nestControllers: 'a1535003-a119-4b1a-833b-d8d21fee254c',
  nestProviders: 'bfb6d7b4-b9c5-46ba-af0d-8107b94ee523',
  prismaSchema: 'e84e0fd9-951a-4930-bb1a-46853d4d25fb',
  prismaCrud: 'fc6ffb27-1e5e-4c2b-b09b-d70f7c25a75b',
};

const RESOURCES: ResourceSeed[] = [
  {
    id: RESOURCE.typescriptHandbook,
    title: 'The TypeScript Handbook',
    description: 'The official guide to the TypeScript language.',
    url: 'https://www.typescriptlang.org/docs/handbook/intro.html',
    type: ResourceType.ARTICLE,
    provider: 'Microsoft',
    costStatus: ResourceCostStatus.FREE,
    certificationCost: null,
    curationRationale:
      'The official language guide, updated with each TypeScript release.',
    status: ResourceStatus.ACTIVE,
    skills: ['TypeScript'],
  },
  {
    id: RESOURCE.nestFirstSteps,
    title: 'NestJS Documentation: First Steps',
    description: 'Creating a NestJS project and its core building blocks.',
    url: 'https://docs.nestjs.com/first-steps',
    type: ResourceType.ARTICLE,
    provider: 'NestJS',
    costStatus: ResourceCostStatus.FREE,
    certificationCost: null,
    curationRationale:
      'Walks through the controllers, services and modules the step practises.',
    status: ResourceStatus.ACTIVE,
    skills: ['NestJS', 'TypeScript'],
  },
  {
    id: RESOURCE.prismaGettingStarted,
    title: 'Prisma ORM: Getting Started',
    description: 'Connecting a Node.js application to a database with Prisma.',
    url: 'https://www.prisma.io/docs/getting-started',
    type: ResourceType.ARTICLE,
    provider: 'Prisma',
    costStatus: ResourceCostStatus.FREE,
    certificationCost: null,
    curationRationale:
      'Covers the database access a CRUD API needs, using the ORM this stack runs on.',
    status: ResourceStatus.ACTIVE,
    skills: ['Prisma'],
  },
  {
    id: RESOURCE.mdnLearnWeb,
    title: 'MDN: Learn Web Development',
    description: 'A structured course on HTML, CSS and accessibility.',
    url: 'https://developer.mozilla.org/en-US/docs/Learn_web_development',
    type: ResourceType.COURSE,
    provider: 'MDN Web Docs',
    costStatus: ResourceCostStatus.FREE,
    certificationCost: null,
    curationRationale:
      'A standards-based path through HTML and CSS, maintained by Mozilla.',
    status: ResourceStatus.ACTIVE,
    skills: ['HTML & CSS'],
  },
  {
    id: RESOURCE.freeCodeCampJs,
    title: 'JavaScript Algorithms and Data Structures',
    description: 'Interactive JavaScript exercises from basics to algorithms.',
    url: 'https://www.freecodecamp.org/learn/javascript-algorithms-and-data-structures-v8',
    type: ResourceType.COURSE,
    provider: 'freeCodeCamp',
    costStatus: ResourceCostStatus.FREE,
    certificationCost: null,
    curationRationale:
      'Hands-on exercises in the browser, with a free certificate at the end.',
    status: ResourceStatus.ACTIVE,
    skills: ['JavaScript'],
  },
  {
    id: RESOURCE.reactQuickStart,
    title: 'React: Quick Start',
    description: 'Components, props, state and effects in the official docs.',
    url: 'https://react.dev/learn',
    type: ResourceType.ARTICLE,
    provider: 'React',
    costStatus: ResourceCostStatus.FREE,
    certificationCost: null,
    curationRationale:
      'The official documentation, with runnable examples for each concept.',
    status: ResourceStatus.ACTIVE,
    skills: ['React', 'JavaScript'],
  },
  {
    id: RESOURCE.createReactApp,
    title: 'Create React App',
    description: 'A command-line tool for bootstrapping React projects.',
    url: 'https://create-react-app.dev/',
    type: ResourceType.ARTICLE,
    provider: 'React',
    costStatus: ResourceCostStatus.FREE,
    certificationCost: null,
    curationRationale:
      'Deprecated by the React team; new projects should start from a framework or build tool.',
    status: ResourceStatus.WITHDRAWN,
    skills: ['React'],
  },
  {
    id: RESOURCE.proGit,
    title: 'Pro Git',
    description: 'The complete Git book, free to read online.',
    url: 'https://git-scm.com/book/en/v2',
    type: ResourceType.BOOK,
    provider: 'Git',
    costStatus: ResourceCostStatus.FREE,
    certificationCost: null,
    curationRationale:
      'Its first three chapters cover the everyday commit, branch and merge workflow.',
    status: ResourceStatus.ACTIVE,
    skills: ['Git'],
  },
  {
    id: RESOURCE.excelHelp,
    title: 'Excel Help & Learning',
    description: 'Tutorials for formulas, pivot tables and charts.',
    url: 'https://support.microsoft.com/en-us/excel/',
    type: ResourceType.ARTICLE,
    provider: 'Microsoft',
    costStatus: ResourceCostStatus.FREE,
    certificationCost: null,
    curationRationale:
      "Microsoft's own tutorials, organised by task from basics to pivot tables.",
    status: ResourceStatus.ACTIVE,
    skills: ['Excel'],
  },
  {
    id: RESOURCE.sqlBolt,
    title: 'SQLBolt',
    description: 'Interactive SQL lessons that run in the browser.',
    url: 'https://sqlbolt.com/',
    type: ResourceType.COURSE,
    provider: 'SQLBolt',
    costStatus: ResourceCostStatus.FREE,
    certificationCost: null,
    curationRationale:
      'Short exercises that build from SELECT to joins and aggregation.',
    status: ResourceStatus.ACTIVE,
    skills: ['SQL'],
  },
  {
    id: RESOURCE.pythonForEverybody,
    title: 'Python for Everybody',
    description:
      'A beginner Python course that ends with working on real data.',
    url: 'https://www.py4e.com/',
    type: ResourceType.COURSE,
    provider: 'Python for Everybody',
    costStatus: ResourceCostStatus.FREE,
    certificationCost: null,
    curationRationale:
      'Free lectures and exercises, including a section on databases and SQL.',
    status: ResourceStatus.ACTIVE,
    skills: ['Python', 'SQL'],
  },
  {
    id: RESOURCE.storytellingWithData,
    title: 'storytelling with data',
    description: 'Guidance on choosing charts and presenting findings.',
    url: 'https://www.storytellingwithdata.com/',
    type: ResourceType.ARTICLE,
    provider: 'storytelling with data',
    costStatus: ResourceCostStatus.FREE,
    certificationCost: null,
    curationRationale:
      'Practical examples of turning analysis into charts a non-technical audience can read.',
    status: ResourceStatus.ACTIVE,
    skills: ['Data Visualization'],
  },
  {
    id: RESOURCE.lawsOfUx,
    title: 'Laws of UX',
    description: 'A reference to the psychology principles behind UX design.',
    url: 'https://lawsofux.com/',
    type: ResourceType.ARTICLE,
    provider: 'Laws of UX',
    costStatus: ResourceCostStatus.FREE,
    certificationCost: null,
    curationRationale:
      'Each principle comes with a short explanation and real interface examples.',
    status: ResourceStatus.ACTIVE,
    skills: ['UX Principles'],
  },
  {
    id: RESOURCE.userInterviews,
    title: 'User Interviews 101',
    description: 'How to plan and run user interviews.',
    url: 'https://www.nngroup.com/articles/user-interviews/',
    type: ResourceType.ARTICLE,
    provider: 'Nielsen Norman Group',
    costStatus: ResourceCostStatus.FREE,
    certificationCost: null,
    curationRationale:
      'Covers planning, question writing and avoiding leading participants.',
    status: ResourceStatus.ACTIVE,
    skills: ['User Research'],
  },
  {
    id: RESOURCE.figmaGetStarted,
    title: 'Figma Learn: Get Started',
    description: 'Figma guides for frames, components and prototypes.',
    url: 'https://help.figma.com/hc/en-us/categories/360002051613',
    type: ResourceType.ARTICLE,
    provider: 'Figma',
    costStatus: ResourceCostStatus.FREE,
    certificationCost: null,
    curationRationale:
      "Figma's own help centre, covering the design and prototyping features the step uses.",
    status: ResourceStatus.ACTIVE,
    skills: ['Figma', 'Prototyping'],
  },
  {
    id: RESOURCE.istqbFoundation,
    title: 'ISTQB Certified Tester Foundation Level',
    description: 'The foundation certification for software testers.',
    url: 'https://istqb.org/certifications/certified-tester-foundation-level-ctfl-v4-0/',
    type: ResourceType.CERTIFICATION,
    provider: 'ISTQB',
    costStatus: ResourceCostStatus.PAID,
    certificationCost: null,
    curationRationale:
      'The most widely recognised entry-level testing certification; its syllabus doubles as a study guide.',
    status: ResourceStatus.ACTIVE,
    skills: ['Test Design'],
  },
  {
    id: RESOURCE.playwrightIntro,
    title: 'Playwright: Getting Started',
    description: 'Installing Playwright and writing a first browser test.',
    url: 'https://playwright.dev/docs/intro',
    type: ResourceType.ARTICLE,
    provider: 'Playwright',
    costStatus: ResourceCostStatus.FREE,
    certificationCost: null,
    curationRationale:
      'Gets a first end-to-end test running in minutes with the official tooling.',
    status: ResourceStatus.ACTIVE,
    skills: ['Test Automation', 'JavaScript'],
  },
  {
    id: RESOURCE.postmanQuickStart,
    title: 'Postman Quick Start',
    description: 'Sending API requests and checking responses in Postman.',
    url: 'https://learning.postman.com/docs/getting-started/quick-start/',
    type: ResourceType.ARTICLE,
    provider: 'Postman',
    costStatus: ResourceCostStatus.FREE,
    certificationCost: null,
    curationRationale:
      'Covers requests, responses and collections, the core of API testing.',
    status: ResourceStatus.ACTIVE,
    skills: ['API Testing'],
  },
  {
    id: RESOURCE.linuxCommandLine,
    title: 'The Linux Command Line',
    description: 'A complete introduction to the shell, free to download.',
    url: 'https://linuxcommand.org/tlcl.php',
    type: ResourceType.BOOK,
    provider: 'William Shotts',
    costStatus: ResourceCostStatus.FREE,
    certificationCost: null,
    curationRationale:
      'Builds command-line fluency from first commands to shell scripts.',
    status: ResourceStatus.ACTIVE,
    skills: ['Linux'],
  },
  {
    id: RESOURCE.dockerGetStarted,
    title: 'Docker: Get Started',
    description: 'Building, running and sharing container images.',
    url: 'https://docs.docker.com/get-started/',
    type: ResourceType.ARTICLE,
    provider: 'Docker',
    costStatus: ResourceCostStatus.FREE,
    certificationCost: null,
    curationRationale:
      'The official walkthrough, from a first container to a multi-container app.',
    status: ResourceStatus.ACTIVE,
    skills: ['Docker'],
  },
  {
    id: RESOURCE.awsCloudPractitioner,
    title: 'AWS Certified Cloud Practitioner',
    description: 'An entry-level certification in core cloud concepts.',
    url: 'https://aws.amazon.com/certification/certified-cloud-practitioner/',
    type: ResourceType.CERTIFICATION,
    provider: 'Amazon Web Services',
    costStatus: ResourceCostStatus.PAID,
    certificationCost: '100.00',
    curationRationale:
      'A common first cloud certification, covering core services, security and pricing.',
    status: ResourceStatus.ACTIVE,
    skills: ['Cloud Fundamentals'],
  },

  // ---------------------------------------------------------------------
  // Frontend Engineer
  // ---------------------------------------------------------------------
  {
    id: RESOURCE.webDevLearnHtml,
    title: 'web.dev: Learn HTML',
    description: 'A free course on semantic HTML, forms, tables and media.',
    url: 'https://web.dev/learn/html',
    type: ResourceType.COURSE,
    provider: 'Google (web.dev)',
    costStatus: ResourceCostStatus.FREE,
    certificationCost: null,
    curationRationale:
      'Short, modular lessons that stress semantics and accessibility from the start.',
    status: ResourceStatus.ACTIVE,
    skills: ['HTML & CSS'],
  },
  {
    id: RESOURCE.webDevLearnCss,
    title: 'web.dev: Learn CSS',
    description: 'A course on the cascade, the box model, layout and theming.',
    url: 'https://web.dev/learn/css',
    type: ResourceType.COURSE,
    provider: 'Google (web.dev)',
    costStatus: ResourceCostStatus.FREE,
    certificationCost: null,
    curationRationale:
      'Explains how CSS actually works, which makes layout bugs easier to diagnose.',
    status: ResourceStatus.ACTIVE,
    skills: ['HTML & CSS'],
  },
  {
    id: RESOURCE.flexboxGuide,
    title: 'A Complete Guide to Flexbox',
    description: 'A visual reference for every flexbox property.',
    url: 'https://css-tricks.com/snippets/css/a-guide-to-flexbox/',
    type: ResourceType.ARTICLE,
    provider: 'CSS-Tricks',
    costStatus: ResourceCostStatus.FREE,
    certificationCost: null,
    curationRationale:
      'The reference most developers keep open while building responsive layouts.',
    status: ResourceStatus.ACTIVE,
    skills: ['HTML & CSS'],
  },
  {
    id: RESOURCE.flexboxFroggy,
    title: 'Flexbox Froggy',
    description: 'A game that teaches flexbox by moving frogs onto lily pads.',
    url: 'https://flexboxfroggy.com/',
    type: ResourceType.COURSE,
    provider: 'Codepip',
    costStatus: ResourceCostStatus.FREE,
    certificationCost: null,
    curationRationale:
      'A quick, playful way to practise the layout properties the step uses.',
    status: ResourceStatus.ACTIVE,
    skills: ['HTML & CSS'],
  },
  {
    id: RESOURCE.javascriptInfo,
    title: 'The Modern JavaScript Tutorial',
    description: 'A thorough tutorial from language basics to the browser.',
    url: 'https://javascript.info/',
    type: ResourceType.COURSE,
    provider: 'javascript.info',
    costStatus: ResourceCostStatus.FREE,
    certificationCost: null,
    curationRationale:
      'Clear explanations with tasks, covering both the language and DOM events.',
    status: ResourceStatus.ACTIVE,
    skills: ['JavaScript'],
  },
  {
    id: RESOURCE.mdnFetchApi,
    title: 'MDN: Using the Fetch API',
    description: 'Making requests and handling responses with fetch().',
    url: 'https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch',
    type: ResourceType.ARTICLE,
    provider: 'MDN Web Docs',
    costStatus: ResourceCostStatus.FREE,
    certificationCost: null,
    curationRationale:
      'Directly supports the step activity of loading data from a public API.',
    status: ResourceStatus.ACTIVE,
    skills: ['JavaScript'],
  },
  {
    id: RESOURCE.eloquentJs,
    title: 'Eloquent JavaScript',
    description: 'A book on programming with JavaScript, free to read online.',
    url: 'https://eloquentjavascript.net/',
    type: ResourceType.BOOK,
    provider: 'Marijn Haverbeke',
    costStatus: ResourceCostStatus.FREE,
    certificationCost: null,
    curationRationale:
      'A deeper read for learners who want to understand the language, not just use it.',
    status: ResourceStatus.ACTIVE,
    skills: ['JavaScript'],
  },
  {
    id: RESOURCE.githubSkills,
    title: 'GitHub Skills',
    description: 'Hands-on courses that run as repositories on GitHub.',
    url: 'https://skills.github.com/',
    type: ResourceType.COURSE,
    provider: 'GitHub',
    costStatus: ResourceCostStatus.FREE,
    certificationCost: null,
    curationRationale:
      'Practise commits, branches and pull requests in a real repository.',
    status: ResourceStatus.ACTIVE,
    skills: ['Git'],
  },
  {
    id: RESOURCE.reactTypescriptCheatsheets,
    title: 'React TypeScript Cheatsheets',
    description: 'Patterns for typing components, props, hooks and events.',
    url: 'https://react-typescript-cheatsheet.netlify.app/',
    type: ResourceType.ARTICLE,
    provider: 'React TypeScript Cheatsheet community',
    costStatus: ResourceCostStatus.FREE,
    certificationCost: null,
    curationRationale:
      'Bridges the gap between the React docs and the TypeScript Handbook.',
    status: ResourceStatus.ACTIVE,
    skills: ['React', 'TypeScript'],
  },
  {
    id: RESOURCE.viteGuide,
    title: 'Vite: Getting Started',
    description: 'Scaffolding and running a modern frontend project with Vite.',
    url: 'https://vite.dev/guide/',
    type: ResourceType.ARTICLE,
    provider: 'Vite',
    costStatus: ResourceCostStatus.FREE,
    certificationCost: null,
    curationRationale:
      'A current replacement for Create React App for starting a new React project.',
    status: ResourceStatus.ACTIVE,
    skills: ['React', 'JavaScript'],
  },

  // ---------------------------------------------------------------------
  // Data Analyst
  // ---------------------------------------------------------------------
  {
    id: RESOURCE.exceljet,
    title: 'Exceljet',
    description: 'Formula examples, tutorials and shortcuts for Excel.',
    url: 'https://exceljet.net/',
    type: ResourceType.ARTICLE,
    provider: 'Exceljet',
    costStatus: ResourceCostStatus.FREE,
    certificationCost: null,
    curationRationale:
      'Concise, example-led pages for lookups, pivot tables and data cleaning.',
    status: ResourceStatus.ACTIVE,
    skills: ['Excel'],
  },
  {
    id: RESOURCE.excelEasy,
    title: 'Excel Easy',
    description: 'A beginner tutorial from basic formulas to charts.',
    url: 'https://www.excel-easy.com/',
    type: ResourceType.COURSE,
    provider: 'Excel Easy',
    costStatus: ResourceCostStatus.FREE,
    certificationCost: null,
    curationRationale:
      'Short step-by-step lessons suited to learners new to spreadsheets.',
    status: ResourceStatus.ACTIVE,
    skills: ['Excel'],
  },
  {
    id: RESOURCE.sqlZoo,
    title: 'SQLZoo',
    description: 'Interactive SQL exercises on real example datasets.',
    url: 'https://sqlzoo.net/',
    type: ResourceType.COURSE,
    provider: 'SQLZoo',
    costStatus: ResourceCostStatus.FREE,
    certificationCost: null,
    curationRationale:
      'More practice on joins and aggregation after the SQLBolt basics.',
    status: ResourceStatus.ACTIVE,
    skills: ['SQL'],
  },
  {
    id: RESOURCE.kaggleIntroSql,
    title: 'Kaggle Learn: Intro to SQL',
    description: 'Short SQL lessons using BigQuery on real datasets.',
    url: 'https://www.kaggle.com/learn/intro-to-sql',
    type: ResourceType.COURSE,
    provider: 'Kaggle',
    costStatus: ResourceCostStatus.FREE,
    certificationCost: null,
    curationRationale:
      'Hands-on exercises in the browser, ending with joins and aggregation.',
    status: ResourceStatus.ACTIVE,
    skills: ['SQL'],
  },
  {
    id: RESOURCE.kaggleIntroPython,
    title: 'Kaggle Learn: Python',
    description: 'A compact Python course aimed at data work.',
    url: 'https://www.kaggle.com/learn/python',
    type: ResourceType.COURSE,
    provider: 'Kaggle',
    costStatus: ResourceCostStatus.FREE,
    certificationCost: null,
    curationRationale:
      'A fast, practical way to learn the Python an analyst needs.',
    status: ResourceStatus.ACTIVE,
    skills: ['Python'],
  },
  {
    id: RESOURCE.kaggleDataViz,
    title: 'Kaggle Learn: Data Visualization',
    description: 'Building charts in Python with seaborn.',
    url: 'https://www.kaggle.com/learn/data-visualization',
    type: ResourceType.COURSE,
    provider: 'Kaggle',
    costStatus: ResourceCostStatus.FREE,
    certificationCost: null,
    curationRationale:
      'Practical exercises for picking and building the right chart for a question.',
    status: ResourceStatus.ACTIVE,
    skills: ['Data Visualization', 'Python'],
  },
  {
    id: RESOURCE.dataToViz,
    title: 'From Data to Viz',
    description: 'A decision tree that helps you choose a chart type.',
    url: 'https://www.data-to-viz.com/',
    type: ResourceType.ARTICLE,
    provider: 'Data to Viz',
    costStatus: ResourceCostStatus.FREE,
    certificationCost: null,
    curationRationale:
      'Maps the shape of your data to suitable charts and common pitfalls.',
    status: ResourceStatus.ACTIVE,
    skills: ['Data Visualization'],
  },
  {
    id: RESOURCE.powerBiGuidedLearning,
    title: 'Power BI Guided Learning',
    description: 'Microsoft lessons on building reports and dashboards.',
    url: 'https://learn.microsoft.com/en-us/power-bi/guided-learning/',
    type: ResourceType.COURSE,
    provider: 'Microsoft',
    costStatus: ResourceCostStatus.FREE,
    certificationCost: null,
    curationRationale:
      'Introduces a widely used dashboard tool for the one-page dashboard activity.',
    status: ResourceStatus.ACTIVE,
    skills: ['Data Visualization'],
  },

  // ---------------------------------------------------------------------
  // UI/UX Designer
  // ---------------------------------------------------------------------
  {
    id: RESOURCE.nngHeuristics,
    title: '10 Usability Heuristics for User Interface Design',
    description: "Nielsen's ten general principles for interaction design.",
    url: 'https://www.nngroup.com/articles/ten-usability-heuristics/',
    type: ResourceType.ARTICLE,
    provider: 'Nielsen Norman Group',
    costStatus: ResourceCostStatus.FREE,
    certificationCost: null,
    curationRationale:
      'The standard checklist for auditing an interface, which the step activity needs.',
    status: ResourceStatus.ACTIVE,
    skills: ['UX Principles'],
  },
  {
    id: RESOURCE.material3,
    title: 'Material Design 3',
    description: "Google's design system guidelines and components.",
    url: 'https://m3.material.io/',
    type: ResourceType.ARTICLE,
    provider: 'Google',
    costStatus: ResourceCostStatus.FREE,
    certificationCost: null,
    curationRationale:
      'Shows how UX principles become concrete components, layout and behaviour.',
    status: ResourceStatus.ACTIVE,
    skills: ['UX Principles'],
  },
  {
    id: RESOURCE.usabilityTesting101,
    title: 'Usability Testing 101',
    description: 'What usability testing is and how to run a basic study.',
    url: 'https://www.nngroup.com/articles/usability-testing-101/',
    type: ResourceType.ARTICLE,
    provider: 'Nielsen Norman Group',
    costStatus: ResourceCostStatus.FREE,
    certificationCost: null,
    curationRationale:
      'Extends interview skills into observing people use a design.',
    status: ResourceStatus.ACTIVE,
    skills: ['User Research'],
  },
  {
    id: RESOURCE.designKitFieldGuide,
    title: 'The Field Guide to Human-Centered Design',
    description: 'IDEO.org methods for understanding and designing for people.',
    url: 'https://www.designkit.org/resources/1.html',
    type: ResourceType.BOOK,
    provider: 'IDEO.org',
    costStatus: ResourceCostStatus.FREE,
    certificationCost: null,
    curationRationale:
      'A practical method library covering interviews, synthesis and ideation.',
    status: ResourceStatus.ACTIVE,
    skills: ['User Research'],
  },
  {
    id: RESOURCE.figmaPrototyping,
    title: 'Guide to Prototyping in Figma',
    description:
      'Connecting frames, triggers and transitions into a prototype.',
    url: 'https://help.figma.com/hc/en-us/articles/360040314193-Guide-to-prototyping-in-Figma',
    type: ResourceType.ARTICLE,
    provider: 'Figma',
    costStatus: ResourceCostStatus.FREE,
    certificationCost: null,
    curationRationale:
      'Covers exactly the clickable-flow work the step asks for.',
    status: ResourceStatus.ACTIVE,
    skills: ['Figma', 'Prototyping'],
  },
  {
    id: RESOURCE.googleUxCertificate,
    title: 'Google UX Design Professional Certificate',
    description: 'A multi-course programme covering research to prototyping.',
    url: 'https://www.coursera.org/professional-certificates/google-ux-design',
    type: ResourceType.CERTIFICATION,
    provider: 'Google (Coursera)',
    costStatus: ResourceCostStatus.PAID,
    certificationCost: null,
    curationRationale:
      'A structured, portfolio-oriented option for learners who want guided projects.',
    status: ResourceStatus.ACTIVE,
    skills: ['Figma', 'User Research', 'Prototyping'],
  },

  // ---------------------------------------------------------------------
  // QA Engineer
  // ---------------------------------------------------------------------
  {
    id: RESOURCE.guru99Testing,
    title: 'Software Testing Tutorial',
    description:
      'A beginner introduction to testing types, levels and process.',
    url: 'https://www.guru99.com/software-testing.html',
    type: ResourceType.ARTICLE,
    provider: 'Guru99',
    costStatus: ResourceCostStatus.FREE,
    certificationCost: null,
    curationRationale:
      'A readable overview that eases learners into the ISTQB vocabulary.',
    status: ResourceStatus.ACTIVE,
    skills: ['Test Design'],
  },
  {
    id: RESOURCE.ministryOfTesting,
    title: 'Ministry of Testing',
    description: 'A testing community with articles, guides and courses.',
    url: 'https://www.ministryoftesting.com/',
    type: ResourceType.ARTICLE,
    provider: 'Ministry of Testing',
    costStatus: ResourceCostStatus.FREE,
    certificationCost: null,
    curationRationale:
      'Practitioner-written content that shows how testing is done on real teams.',
    status: ResourceStatus.ACTIVE,
    skills: ['Test Design'],
  },
  {
    id: RESOURCE.playwrightBestPractices,
    title: 'Playwright: Best Practices',
    description: 'Writing reliable, maintainable end-to-end tests.',
    url: 'https://playwright.dev/docs/best-practices',
    type: ResourceType.ARTICLE,
    provider: 'Playwright',
    costStatus: ResourceCostStatus.FREE,
    certificationCost: null,
    curationRationale:
      'Helps avoid flaky tests, the most common problem in browser automation.',
    status: ResourceStatus.ACTIVE,
    skills: ['Test Automation'],
  },
  {
    id: RESOURCE.testAutomationUniversity,
    title: 'Test Automation University',
    description: 'Free video courses on automation tools and techniques.',
    url: 'https://testautomationu.applitools.com/',
    type: ResourceType.COURSE,
    provider: 'Applitools',
    costStatus: ResourceCostStatus.FREE,
    certificationCost: null,
    curationRationale:
      'Free, tool-focused courses taught by working automation engineers.',
    status: ResourceStatus.ACTIVE,
    skills: ['Test Automation', 'JavaScript'],
  },
  {
    id: RESOURCE.postmanTestScripts,
    title: 'Postman: Write Test Scripts',
    description:
      'Adding assertions to requests and running them in collections.',
    url: 'https://learning.postman.com/docs/tests-and-scripts/write-scripts/test-scripts/',
    type: ResourceType.ARTICLE,
    provider: 'Postman',
    costStatus: ResourceCostStatus.FREE,
    certificationCost: null,
    curationRationale:
      'Turns manual requests into the automated checks the step activity requires.',
    status: ResourceStatus.ACTIVE,
    skills: ['API Testing'],
  },
  {
    id: RESOURCE.mdnHttpOverview,
    title: 'MDN: An Overview of HTTP',
    description: 'How requests, responses and headers work.',
    url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Overview',
    type: ResourceType.ARTICLE,
    provider: 'MDN Web Docs',
    costStatus: ResourceCostStatus.FREE,
    certificationCost: null,
    curationRationale:
      'Covers the HTTP knowledge the step lists as a prerequisite.',
    status: ResourceStatus.ACTIVE,
    skills: ['API Testing'],
  },
  {
    id: RESOURCE.mdnHttpStatus,
    title: 'MDN: HTTP Response Status Codes',
    description: 'A reference to every standard status code and its meaning.',
    url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Status',
    type: ResourceType.ARTICLE,
    provider: 'MDN Web Docs',
    costStatus: ResourceCostStatus.FREE,
    certificationCost: null,
    curationRationale:
      'A dependable reference when deciding what an API should return in error cases.',
    status: ResourceStatus.ACTIVE,
    skills: ['API Testing'],
  },

  // ---------------------------------------------------------------------
  // Cloud Engineer
  // ---------------------------------------------------------------------
  {
    id: RESOURCE.linuxJourney,
    title: 'Linux Journey',
    description: 'Beginner-friendly lessons on Linux, from basics to services.',
    url: 'https://linuxjourney.com/',
    type: ResourceType.COURSE,
    provider: 'Linux Journey',
    costStatus: ResourceCostStatus.FREE,
    certificationCost: null,
    curationRationale:
      'Short, graded lessons that complement the longer Linux Command Line book.',
    status: ResourceStatus.ACTIVE,
    skills: ['Linux'],
  },
  {
    id: RESOURCE.overTheWireBandit,
    title: 'OverTheWire: Bandit',
    description: 'A command-line wargame that teaches Linux through puzzles.',
    url: 'https://overthewire.org/wargames/bandit/',
    type: ResourceType.COURSE,
    provider: 'OverTheWire',
    costStatus: ResourceCostStatus.FREE,
    certificationCost: null,
    curationRationale:
      'Builds real shell fluency on a remote server, which is how cloud work is done.',
    status: ResourceStatus.ACTIVE,
    skills: ['Linux'],
  },
  {
    id: RESOURCE.dockerCompose,
    title: 'Docker Compose Overview',
    description: 'Defining and running multi-container applications.',
    url: 'https://docs.docker.com/compose/',
    type: ResourceType.ARTICLE,
    provider: 'Docker',
    costStatus: ResourceCostStatus.FREE,
    certificationCost: null,
    curationRationale:
      'Covers the Compose file the step activity asks learners to write.',
    status: ResourceStatus.ACTIVE,
    skills: ['Docker'],
  },
  {
    id: RESOURCE.dockerfileBestPractices,
    title: 'Docker: Building Best Practices',
    description: 'Writing small, fast and secure Dockerfiles.',
    url: 'https://docs.docker.com/build/building/best-practices/',
    type: ResourceType.ARTICLE,
    provider: 'Docker',
    costStatus: ResourceCostStatus.FREE,
    certificationCost: null,
    curationRationale:
      'Moves learners from a working image to a well-built one.',
    status: ResourceStatus.ACTIVE,
    skills: ['Docker'],
  },
  {
    id: RESOURCE.playWithDocker,
    title: 'Play with Docker',
    description: 'A free browser-based Docker playground and lab environment.',
    url: 'https://labs.play-with-docker.com/',
    type: ResourceType.COURSE,
    provider: 'Docker',
    costStatus: ResourceCostStatus.FREE,
    certificationCost: null,
    curationRationale:
      'Lets learners practise containers without installing anything locally.',
    status: ResourceStatus.ACTIVE,
    skills: ['Docker'],
  },
  {
    id: RESOURCE.awsCloudPractitionerTraining,
    title: 'AWS Cloud Practitioner Learning Path',
    description: 'Free AWS training that prepares for the foundational exam.',
    url: 'https://aws.amazon.com/training/learn-about/cloud-practitioner/',
    type: ResourceType.COURSE,
    provider: 'Amazon Web Services',
    costStatus: ResourceCostStatus.FREE,
    certificationCost: null,
    curationRationale:
      'The official preparation route for the certification listed in this step.',
    status: ResourceStatus.ACTIVE,
    skills: ['Cloud Fundamentals'],
  },
  {
    id: RESOURCE.awsPricingCalculator,
    title: 'AWS Pricing Calculator',
    description: 'A tool to estimate the monthly cost of AWS services.',
    url: 'https://calculator.aws/',
    type: ResourceType.ARTICLE,
    provider: 'Amazon Web Services',
    costStatus: ResourceCostStatus.FREE,
    certificationCost: null,
    curationRationale:
      'Directly supports the step activity of estimating a monthly cost.',
    status: ResourceStatus.ACTIVE,
    skills: ['Cloud Fundamentals'],
  },
  {
    id: RESOURCE.awsWellArchitected,
    title: 'AWS Well-Architected Framework',
    description: 'Best practices for secure, reliable and cost-aware systems.',
    url: 'https://aws.amazon.com/architecture/well-architected/',
    type: ResourceType.ARTICLE,
    provider: 'Amazon Web Services',
    costStatus: ResourceCostStatus.FREE,
    certificationCost: null,
    curationRationale:
      'Gives learners a vocabulary for judging a deployment plan.',
    status: ResourceStatus.ACTIVE,
    skills: ['Cloud Fundamentals'],
  },

  // ---------------------------------------------------------------------
  // Backend (pathway seeded elsewhere)
  // ---------------------------------------------------------------------
  {
    id: RESOURCE.typescriptIn5Minutes,
    title: 'TypeScript for JavaScript Programmers',
    description:
      'A short introduction to TypeScript for JavaScript developers.',
    url: 'https://www.typescriptlang.org/docs/handbook/typescript-in-5-minutes.html',
    type: ResourceType.ARTICLE,
    provider: 'Microsoft',
    costStatus: ResourceCostStatus.FREE,
    certificationCost: null,
    curationRationale: 'A quick on-ramp before the full handbook.',
    status: ResourceStatus.ACTIVE,
    skills: ['TypeScript'],
  },
  {
    id: RESOURCE.nestControllers,
    title: 'NestJS Documentation: Controllers',
    description: 'Routing requests and shaping responses in NestJS.',
    url: 'https://docs.nestjs.com/controllers',
    type: ResourceType.ARTICLE,
    provider: 'NestJS',
    costStatus: ResourceCostStatus.FREE,
    certificationCost: null,
    curationRationale: 'Goes deeper on the routing layer of a CRUD API.',
    status: ResourceStatus.ACTIVE,
    skills: ['NestJS', 'TypeScript'],
  },
  {
    id: RESOURCE.nestProviders,
    title: 'NestJS Documentation: Providers',
    description: 'Services and dependency injection in NestJS.',
    url: 'https://docs.nestjs.com/providers',
    type: ResourceType.ARTICLE,
    provider: 'NestJS',
    costStatus: ResourceCostStatus.FREE,
    certificationCost: null,
    curationRationale:
      'Explains where business logic lives and how it is injected.',
    status: ResourceStatus.ACTIVE,
    skills: ['NestJS', 'TypeScript'],
  },
  {
    id: RESOURCE.prismaSchema,
    title: 'Prisma ORM: Schema Overview',
    description: 'Modelling tables and relations in the Prisma schema.',
    url: 'https://www.prisma.io/docs/orm/prisma-schema/overview',
    type: ResourceType.ARTICLE,
    provider: 'Prisma',
    costStatus: ResourceCostStatus.FREE,
    certificationCost: null,
    curationRationale: 'Covers the data modelling a CRUD API starts from.',
    status: ResourceStatus.ACTIVE,
    skills: ['Prisma'],
  },
  {
    id: RESOURCE.prismaCrud,
    title: 'Prisma ORM: CRUD Queries',
    description: 'Creating, reading, updating and deleting records.',
    url: 'https://www.prisma.io/docs/orm/prisma-client/queries/crud',
    type: ResourceType.ARTICLE,
    provider: 'Prisma',
    costStatus: ResourceCostStatus.FREE,
    certificationCost: null,
    curationRationale:
      'The query reference for the create, read, update and delete endpoints.',
    status: ResourceStatus.ACTIVE,
    skills: ['Prisma'],
  },
];

const BACKEND_STEP_RESOURCES: Record<number, string[]> = {
  1: [RESOURCE.typescriptHandbook, RESOURCE.typescriptIn5Minutes],
  2: [
    RESOURCE.nestFirstSteps,
    RESOURCE.nestControllers,
    RESOURCE.nestProviders,
    RESOURCE.prismaGettingStarted,
    RESOURCE.prismaSchema,
    RESOURCE.prismaCrud,
  ],
};

const usSalary = (
  median: string,
  percentile25: string,
  percentile75: string,
): OutlookRow => ({
  type: OutlookType.SALARY,
  geography: 'United States',
  source: 'US Bureau of Labor Statistics',
  sourceUrl: 'https://www.bls.gov/ooh/',
  period: 'May 2024',
  median,
  percentile25,
  percentile75,
  currency: 'USD',
  payPeriod: 'year',
  grossOrNet: 'gross',
  experienceLevel: 'all experience levels',
});

const lagosSalary = (median: string): OutlookRow => ({
  type: OutlookType.SALARY,
  geography: 'Lagos, Nigeria',
  source: 'Local Tech Salary Survey',
  period: 'Q2 2025',
  median,
  currency: 'NGN',
  payPeriod: 'year',
  grossOrNet: 'gross',
  experienceLevel: 'entry-level',
});

const usGrowth = (baseValue: number, projectedValue: number): OutlookRow => ({
  type: OutlookType.EMPLOYMENT_GROWTH,
  geography: 'United States',
  source: 'US Bureau of Labor Statistics',
  period: '2023–2033',
  baseYear: 2023,
  baseValue,
  projectedYear: 2033,
  projectedValue,
  growthPercent: (((projectedValue - baseValue) / baseValue) * 100).toFixed(2),
});

const lagosDemand = (demandLevel: Demand): OutlookRow => ({
  type: OutlookType.DEMAND,
  geography: 'Lagos, Nigeria',
  source: 'Local Tech Ecosystem Report',
  period: '2025',
  demandLevel,
});

const CAREERS: CareerSeed[] = [
  {
    slug: 'frontend-engineer',
    title: 'Frontend Engineer',
    description:
      'Builds the parts of web applications that people see and use.',
    roleSummary:
      'Turns designs into accessible, responsive web interfaces and connects them to backend APIs.',
    exampleActivities: [
      'Build UI components from design files',
      'Connect pages to REST APIs',
      'Fix layout and accessibility issues across browsers',
      'Write component and end-to-end tests',
      'Review pull requests from teammates',
    ],
    typicalEducationNote:
      'Degree in computing or a related field, or a bootcamp or self-taught portfolio of web projects.',
    certificationsNote:
      'Not usually required. A portfolio of live projects carries more weight.',
    targetLevels: [
      TargetLevel.STUDENT,
      TargetLevel.RECENT_GRAD,
      TargetLevel.EARLY_CAREER,
    ],
    status: CareerStatus.PUBLISHED,
    field: 'software-engineering',
    skills: ['JavaScript', 'TypeScript', 'HTML & CSS', 'React', 'Git'],
    outlook: [
      usSalary('98000.00', '74000.00', '128000.00'),
      lagosSalary('4200000.00'),
      usGrowth(223, 240),
      lagosDemand(Demand.HIGH),
    ],
    pathway: {
      title: 'Frontend Engineering Fundamentals',
      description: 'Core steps to build and ship accessible web interfaces.',
      steps: [
        {
          title: 'Structure and style pages with HTML and CSS',
          description:
            'Semantic HTML, the box model, flexbox and responsive layouts.',
          learningObjective:
            'Build a responsive, accessible page from a design using semantic HTML and modern CSS layout.',
          prerequisites: null,
          expectedActivity:
            'Recreate a provided landing-page design that works at phone and desktop widths.',
          skills: ['HTML & CSS'],
          resources: [
            RESOURCE.mdnLearnWeb,
            RESOURCE.webDevLearnHtml,
            RESOURCE.webDevLearnCss,
            RESOURCE.flexboxGuide,
            RESOURCE.flexboxFroggy,
          ],
        },
        {
          title: 'Program the page with JavaScript',
          description:
            'Variables, functions, arrays, DOM events and fetching data.',
          learningObjective:
            'Write JavaScript that responds to user input and loads data from an API.',
          prerequisites: 'Comfortable writing semantic HTML and CSS layouts.',
          expectedActivity:
            'Add search and filtering to a list fetched from a public API, tracking the work in Git.',
          skills: ['JavaScript', 'Git'],
          resources: [
            RESOURCE.freeCodeCampJs,
            RESOURCE.javascriptInfo,
            RESOURCE.mdnFetchApi,
            RESOURCE.eloquentJs,
            RESOURCE.proGit,
            RESOURCE.githubSkills,
          ],
        },
        {
          title: 'Build interfaces with React',
          description: 'Components, props, state and effects.',
          learningObjective:
            'Split an interface into reusable React components that manage their own state.',
          prerequisites:
            'Working knowledge of JavaScript functions, arrays and DOM events.',
          expectedActivity:
            'Rebuild the previous project in React with at least three components and a loading state.',
          skills: ['React', 'TypeScript'],
          resources: [
            RESOURCE.reactQuickStart,
            RESOURCE.typescriptHandbook,
            RESOURCE.reactTypescriptCheatsheets,
            RESOURCE.viteGuide,
            RESOURCE.createReactApp,
          ],
        },
      ],
    },
  },
  {
    slug: 'data-analyst',
    title: 'Data Analyst',
    description: 'Turns raw data into answers that help teams make decisions.',
    roleSummary:
      'Collects, cleans and analyses data, then presents findings through reports and dashboards.',
    exampleActivities: [
      'Write SQL queries to pull and join data',
      'Clean and validate datasets in spreadsheets or Python',
      'Build dashboards for recurring reports',
      'Present findings to non-technical stakeholders',
      'Define and track business metrics',
    ],
    typicalEducationNote:
      'Degree in statistics, economics, computing or a related field; strong spreadsheet and SQL skills can substitute.',
    certificationsNote:
      'Optional. Entry-level data certificates can help when you have no work experience yet.',
    targetLevels: [
      TargetLevel.STUDENT,
      TargetLevel.RECENT_GRAD,
      TargetLevel.EARLY_CAREER,
    ],
    status: CareerStatus.PUBLISHED,
    field: 'data-analytics',
    skills: ['SQL', 'Excel', 'Python', 'Data Visualization'],
    outlook: [
      usSalary('86000.00', '64000.00', '112000.00'),
      lagosSalary('3600000.00'),
      usGrowth(118, 145),
      lagosDemand(Demand.HIGH),
    ],
    pathway: {
      title: 'Data Analysis Fundamentals',
      description: 'Core steps to answer business questions with data.',
      steps: [
        {
          title: 'Analyse data in spreadsheets',
          description: 'Formulas, lookups, pivot tables and charts.',
          learningObjective:
            'Clean a raw dataset and summarise it with formulas and pivot tables.',
          prerequisites: null,
          expectedActivity:
            'Clean a sales export and build a pivot table that answers three business questions.',
          skills: ['Excel'],
          resources: [
            RESOURCE.excelHelp,
            RESOURCE.exceljet,
            RESOURCE.excelEasy,
          ],
        },
        {
          title: 'Query databases with SQL',
          description: 'Filtering, aggregation and joins.',
          learningObjective:
            'Write SQL queries that filter, aggregate and join tables to answer a question.',
          prerequisites: 'Comfortable summarising data in a spreadsheet.',
          expectedActivity:
            'Answer five questions about a sample database using joins and GROUP BY.',
          skills: ['SQL', 'Python'],
          resources: [
            RESOURCE.sqlBolt,
            RESOURCE.sqlZoo,
            RESOURCE.kaggleIntroSql,
            RESOURCE.pythonForEverybody,
            RESOURCE.kaggleIntroPython,
          ],
        },
        {
          title: 'Present findings with visualisations',
          description: 'Choosing charts and telling a clear story with data.',
          learningObjective:
            'Choose chart types that fit the question and present findings to a non-technical audience.',
          prerequisites:
            'Able to produce summary tables from SQL or spreadsheets.',
          expectedActivity:
            'Build a one-page dashboard and give a five-minute walkthrough of what it shows.',
          skills: ['Data Visualization'],
          resources: [
            RESOURCE.storytellingWithData,
            RESOURCE.dataToViz,
            RESOURCE.kaggleDataViz,
            RESOURCE.powerBiGuidedLearning,
          ],
        },
      ],
    },
  },
  {
    slug: 'ui-ux-designer',
    title: 'UI/UX Designer',
    description: 'Designs digital products that are easy and pleasant to use.',
    roleSummary:
      'Researches user needs, then designs flows, wireframes and interfaces that meet them.',
    exampleActivities: [
      'Run user interviews and usability tests',
      'Map user flows and information architecture',
      'Create wireframes and high-fidelity designs in Figma',
      'Maintain a design system',
      'Hand off designs to developers',
    ],
    typicalEducationNote:
      'Degree in design, human-computer interaction or a related field, or a bootcamp plus a case-study portfolio.',
    certificationsNote:
      'Rarely required. A portfolio of case studies that shows your process matters most.',
    targetLevels: [TargetLevel.STUDENT, TargetLevel.RECENT_GRAD],
    status: CareerStatus.PUBLISHED,
    field: 'design',
    skills: ['Figma', 'User Research', 'UX Principles', 'Prototyping'],
    outlook: [
      usSalary('95000.00', '70000.00', '124000.00'),
      lagosSalary('3900000.00'),
      usGrowth(106, 115),
      lagosDemand(Demand.MEDIUM),
    ],
    pathway: {
      title: 'UI/UX Design Fundamentals',
      description: 'Core steps to research, design and test digital products.',
      steps: [
        {
          title: 'Learn the principles of good UX',
          description:
            'Heuristics and the psychology behind usable interfaces.',
          learningObjective:
            'Explain common UX principles and spot where an existing app breaks them.',
          prerequisites: null,
          expectedActivity:
            'Audit a familiar app against five UX principles and propose fixes.',
          skills: ['UX Principles'],
          resources: [
            RESOURCE.lawsOfUx,
            RESOURCE.nngHeuristics,
            RESOURCE.material3,
          ],
        },
        {
          title: 'Research user needs',
          description: 'Planning and running user interviews.',
          learningObjective:
            'Plan and run user interviews that uncover needs without leading participants.',
          prerequisites: 'Familiar with basic UX principles.',
          expectedActivity:
            'Interview three people about a daily task and summarise the patterns you find.',
          skills: ['User Research'],
          resources: [
            RESOURCE.userInterviews,
            RESOURCE.usabilityTesting101,
            RESOURCE.designKitFieldGuide,
          ],
        },
        {
          title: 'Design and prototype in Figma',
          description: 'Frames, components, auto layout and prototypes.',
          learningObjective:
            'Turn research findings into a clickable Figma prototype.',
          prerequisites: 'Research notes from user interviews.',
          expectedActivity:
            'Design and prototype a three-screen flow that addresses a need from your interviews.',
          skills: ['Figma', 'Prototyping'],
          resources: [
            RESOURCE.figmaGetStarted,
            RESOURCE.figmaPrototyping,
            RESOURCE.googleUxCertificate,
          ],
        },
      ],
    },
  },
  {
    slug: 'qa-engineer',
    title: 'QA Engineer',
    description: 'Makes sure software works before it reaches users.',
    roleSummary:
      'Plans and runs manual and automated tests to find defects early and keep releases stable.',
    exampleActivities: [
      'Write test plans and test cases from requirements',
      'Automate regression tests',
      'Test APIs with tools such as Postman',
      'Report and track defects',
      'Verify fixes before release',
    ],
    typicalEducationNote:
      'Degree in computing or a related field is common; many testers move in from support or other technical roles.',
    certificationsNote:
      'The ISTQB Foundation Level certificate is widely recognised for testers.',
    targetLevels: [TargetLevel.RECENT_GRAD, TargetLevel.EARLY_CAREER],
    status: CareerStatus.PUBLISHED,
    field: 'software-engineering',
    skills: [
      'Test Design',
      'Test Automation',
      'API Testing',
      'JavaScript',
      'SQL',
    ],
    outlook: [
      usSalary('102000.00', '79000.00', '130000.00'),
      lagosSalary('3300000.00'),
      usGrowth(205, 236),
      lagosDemand(Demand.MEDIUM),
    ],
    pathway: {
      title: 'Software Testing Fundamentals',
      description: 'Core steps to test software manually and automatically.',
      steps: [
        {
          title: 'Learn testing fundamentals',
          description:
            'Test levels, test design techniques and defect reporting.',
          learningObjective:
            'Design test cases from requirements using equivalence partitioning and boundary values.',
          prerequisites: null,
          expectedActivity:
            'Write test cases for a sign-up form, run them and log the defects you find.',
          skills: ['Test Design'],
          resources: [
            RESOURCE.istqbFoundation,
            RESOURCE.guru99Testing,
            RESOURCE.ministryOfTesting,
          ],
        },
        {
          title: 'Automate browser tests',
          description: 'Writing and running end-to-end tests with Playwright.',
          learningObjective:
            'Automate a user journey so it runs on every change.',
          prerequisites:
            'Able to write test cases from requirements, and basic JavaScript.',
          expectedActivity:
            'Automate the sign-up test cases from the previous step with Playwright.',
          skills: ['Test Automation', 'JavaScript'],
          resources: [
            RESOURCE.playwrightIntro,
            RESOURCE.playwrightBestPractices,
            RESOURCE.testAutomationUniversity,
          ],
        },
        {
          title: 'Test APIs',
          description: 'Requests, status codes, assertions and collections.',
          learningObjective:
            "Verify an API's success and error responses with automated checks.",
          prerequisites: 'Comfortable with HTTP requests and JSON.',
          expectedActivity:
            'Build a Postman collection that checks success and error cases for a public API.',
          skills: ['API Testing'],
          resources: [
            RESOURCE.postmanQuickStart,
            RESOURCE.postmanTestScripts,
            RESOURCE.mdnHttpOverview,
            RESOURCE.mdnHttpStatus,
          ],
        },
      ],
    },
  },
  {
    slug: 'cloud-engineer',
    title: 'Cloud Engineer',
    description: 'Builds and runs the infrastructure applications depend on.',
    roleSummary:
      'Provisions, automates and monitors cloud infrastructure so applications stay available and secure.',
    exampleActivities: [
      'Provision servers, networks and databases in the cloud',
      'Automate deployments with CI/CD pipelines',
      'Containerise applications with Docker',
      'Monitor systems and respond to incidents',
      'Manage access and security settings',
    ],
    typicalEducationNote:
      'Degree in computing or IT, or equivalent experience in system administration.',
    certificationsNote:
      'Cloud certifications such as AWS Certified Cloud Practitioner are common entry points.',
    targetLevels: [TargetLevel.EARLY_CAREER],
    status: CareerStatus.DRAFT,
    field: 'cloud-infrastructure',
    skills: ['Linux', 'Docker', 'Cloud Fundamentals', 'Git'],
    outlook: [
      usSalary('118000.00', '92000.00', '148000.00'),
      lagosSalary('5400000.00'),
      usGrowth(180, 203),
      lagosDemand(Demand.HIGH),
    ],
    pathway: {
      title: 'Cloud Engineering Fundamentals',
      description: 'Core steps to run applications on cloud infrastructure.',
      steps: [
        {
          title: 'Work on the Linux command line',
          description: 'Files, permissions, processes and shell scripts.',
          learningObjective:
            'Manage files, users and processes on a Linux server from the command line.',
          prerequisites: null,
          expectedActivity:
            'Write a shell script that backs up a directory and removes old backups.',
          skills: ['Linux'],
          resources: [
            RESOURCE.linuxCommandLine,
            RESOURCE.linuxJourney,
            RESOURCE.overTheWireBandit,
          ],
        },
        {
          title: 'Package applications with Docker',
          description: 'Images, containers, volumes and Compose.',
          learningObjective:
            'Containerise an application and run it with its database using Docker Compose.',
          prerequisites: 'Comfortable on the Linux command line.',
          expectedActivity:
            'Containerise a small API and its database with a Dockerfile and a Compose file.',
          skills: ['Docker', 'Git'],
          resources: [
            RESOURCE.dockerGetStarted,
            RESOURCE.dockerCompose,
            RESOURCE.dockerfileBestPractices,
            RESOURCE.playWithDocker,
            RESOURCE.proGit,
          ],
        },
        {
          title: 'Learn cloud foundations',
          description: 'Core services, shared responsibility and pricing.',
          learningObjective:
            'Explain core cloud services and estimate the monthly cost of a small deployment.',
          prerequisites: 'Able to run applications in containers.',
          expectedActivity:
            'Plan a cloud deployment for the containerised API, with a monthly cost estimate.',
          skills: ['Cloud Fundamentals'],
          resources: [
            RESOURCE.awsCloudPractitioner,
            RESOURCE.awsCloudPractitionerTraining,
            RESOURCE.awsPricingCalculator,
            RESOURCE.awsWellArchitected,
          ],
        },
      ],
    },
  },
  {
    slug: 'webmaster',
    title: 'Webmaster',
    description: 'Maintained company websites end to end.',
    roleSummary:
      'Kept websites online and up to date, from content changes to server upkeep; the work now sits with dedicated web, content and operations roles.',
    exampleActivities: [
      'Update site content and pages',
      'Monitor uptime and fix broken links',
      'Manage hosting and domain settings',
      'Report on site traffic',
    ],
    typicalEducationNote: null,
    certificationsNote: null,
    targetLevels: [TargetLevel.RECENT_GRAD],
    status: CareerStatus.RETIRED,
    field: 'software-engineering',
    skills: ['HTML & CSS', 'JavaScript'],
    outlook: [
      usSalary('62000.00', '48000.00', '80000.00'),
      lagosSalary('2400000.00'),
      usGrowth(40, 36),
      lagosDemand(Demand.LOW),
    ],
  },
];

const idOf = (ids: Map<string, string>, key: string): string => {
  const id = ids.get(key);

  if (!id) {
    throw new Error(`Seed data references unknown key "${key}"`);
  }

  return id;
};

async function upsertFields(
  prisma: PrismaClient,
): Promise<Map<string, string>> {
  const ids = new Map<string, string>();

  for (const { slug, name } of FIELDS) {
    const field = await prisma.field.upsert({
      where: { slug },
      update: { name },
      create: { slug, name },
    });

    ids.set(slug, field.id);
  }

  return ids;
}

async function upsertSkills(
  prisma: PrismaClient,
): Promise<Map<string, string>> {
  for (const { name, description } of SKILLS) {
    await prisma.skill.upsert({
      where: { name },
      update: { description },
      create: { name, description },
    });
  }

  const skills = await prisma.skill.findMany({
    select: { id: true, name: true },
  });

  return new Map(skills.map(({ id, name }) => [name, id]));
}

async function upsertResources(
  prisma: PrismaClient,
  skillIds: Map<string, string>,
): Promise<void> {
  for (const { id, skills, ...resource } of RESOURCES) {
    const data = { ...resource, lastCheckedDate: LAST_CHECKED };

    await prisma.resource.upsert({
      where: { id },
      update: data,
      create: { id, ...data },
    });

    await prisma.resourceSkill.deleteMany({ where: { resourceId: id } });
    await prisma.resourceSkill.createMany({
      data: skills.map((name) => ({
        resourceId: id,
        skillId: idOf(skillIds, name),
      })),
    });
  }
}

async function linkStepResources(
  prisma: PrismaClient,
  pathwayStepId: string,
  resourceIds: string[],
): Promise<void> {
  await prisma.pathwayStepResource.deleteMany({ where: { pathwayStepId } });
  await prisma.pathwayStepResource.createMany({
    data: resourceIds.map((resourceId) => ({ pathwayStepId, resourceId })),
  });
}

async function upsertPathway(
  prisma: PrismaClient,
  careerId: string,
  { title, description, steps }: NonNullable<CareerSeed['pathway']>,
  skillIds: Map<string, string>,
): Promise<void> {
  const pathway = await prisma.pathway.upsert({
    where: { careerId },
    update: { title, description },
    create: { careerId, title, description },
  });

  for (const [index, { skills, resources, ...step }] of steps.entries()) {
    const order = index + 1;

    const { id: pathwayStepId } = await prisma.pathwayStep.upsert({
      where: { pathwayId_order: { pathwayId: pathway.id, order } },
      update: step,
      create: { pathwayId: pathway.id, order, ...step },
    });

    await prisma.pathwayStepSkill.deleteMany({ where: { pathwayStepId } });
    await prisma.pathwayStepSkill.createMany({
      data: skills.map((name) => ({
        pathwayStepId,
        skillId: idOf(skillIds, name),
      })),
    });

    await linkStepResources(prisma, pathwayStepId, resources);
  }

  await prisma.pathwayStep.deleteMany({
    where: { pathwayId: pathway.id, order: { gt: steps.length } },
  });
}

async function upsertCareer(
  prisma: PrismaClient,
  { slug, field, skills, outlook, pathway, ...details }: CareerSeed,
  fieldIds: Map<string, string>,
  skillIds: Map<string, string>,
): Promise<void> {
  const data = {
    ...details,
    field: { connect: { id: idOf(fieldIds, field) } },
  };

  const { id: careerId } = await prisma.career.upsert({
    where: { slug },
    update: data,
    create: { slug, ...data },
  });

  await prisma.careerSkill.deleteMany({ where: { careerId } });
  await prisma.careerSkill.createMany({
    data: skills.map((name) => ({ careerId, skillId: idOf(skillIds, name) })),
  });

  await prisma.outlookData.deleteMany({ where: { careerId } });
  await prisma.outlookData.createMany({
    data: outlook.map((row) => ({ ...row, careerId })),
  });

  if (pathway) {
    await upsertPathway(prisma, careerId, pathway, skillIds);
  }
}

async function linkBackendResources(
  prisma: PrismaClient,
  pathwayId: string,
): Promise<void> {
  for (const [order, resourceIds] of Object.entries(BACKEND_STEP_RESOURCES)) {
    const { id: pathwayStepId } = await prisma.pathwayStep.findUniqueOrThrow({
      where: { pathwayId_order: { pathwayId, order: Number(order) } },
      select: { id: true },
    });

    await linkStepResources(prisma, pathwayStepId, resourceIds);
  }
}

export async function seedCatalog(
  prisma: PrismaClient,
  backendPathwayId: string,
): Promise<void> {
  const fieldIds = await upsertFields(prisma);
  const skillIds = await upsertSkills(prisma);

  await upsertResources(prisma, skillIds);

  for (const career of CAREERS) {
    await upsertCareer(prisma, career, fieldIds, skillIds);
  }

  await linkBackendResources(prisma, backendPathwayId);

  await prisma.career.updateMany({
    where: { status: { not: CareerStatus.DRAFT }, publishedAt: null },
    data: { publishedAt: PUBLISHED_AT },
  });
}
