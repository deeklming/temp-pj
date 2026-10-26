import { data } from "react-router";
export function loader() {
	throw data({ code: "NOT_FOUND" }, { status: 404 });
}
export default function NotFound() {
	return null;
}
