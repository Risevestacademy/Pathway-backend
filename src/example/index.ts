// This is the module's public boundary. Other modules import from
// here, not from the individual files directly.
//
//   import { ExampleService } from '../example';        ✅
//   import { ExampleService } from '../example/example.service'; ❌
//
// Only export what's meant to be used outside this module.
// The controller is intentionally NOT exported — nothing outside this
// module should ever call ExampleController directly.
export { ExampleService } from './example.service';
export { ExampleModule } from './example.module';
