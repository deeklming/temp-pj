import { expect, test } from "bun:test";
import { validateAuth, validatePost } from "./contracts";
import cases from "./validation-cases.json";

for (const example of cases) {
	test(`shared validation: ${example.name}`, () => {
		const errors =
			example.kind === "post"
				? validatePost(example.input)
				: validateAuth(example.input, example.signup ?? false);
		expect(errors).toEqual(example.errors);
	});
}
