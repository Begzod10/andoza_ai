// Registers jest-dom's custom matchers (toBeInTheDocument, toBeDisabled, ...)
// on vitest's `expect` — without this, every component test using them fails
// with "Invalid Chai property" instead of a real assertion result.
import "@testing-library/jest-dom";
