import nextVitals from "eslint-config-next/core-web-vitals"
import nextTypescript from "eslint-config-next/typescript"

const eslintConfig = [
	...nextVitals,
	...nextTypescript,
	{
		rules: {
			"react-hooks/set-state-in-effect": "off",
			"react-hooks/static-components": "off",
			"@typescript-eslint/no-explicit-any": "off",
		},
	},
	{
		files: ["scripts/**/*.js"],
		rules: {
			"@typescript-eslint/no-require-imports": "off",
		},
	},
]

export default eslintConfig
