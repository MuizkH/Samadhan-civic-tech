import { IssueCategory } from "./IssueCategory";

/**
 * How a category actually arrives on an Issue.
 *
 * The list endpoint returns the expanded `{ code, nameEn }` object while some
 * older mock and map paths still carry the bare code string. Both shapes are
 * real, so they are named here instead of being flattened with a cast at each
 * of the five places that read them.
 */
export interface CategoryRef {
  code: string;
  nameEn?: string;
  nameHi?: string;
}

export type IssueCategoryValue = IssueCategory | string | CategoryRef;

function isCategoryRef(value: IssueCategoryValue): value is CategoryRef {
  return typeof value === "object" && value !== null && "code" in value;
}

/** The machine-readable code, whichever shape the category came in as. */
export function categoryCodeOf(value: IssueCategoryValue | null | undefined): string {
  if (!value) return "";
  return isCategoryRef(value) ? value.code : String(value);
}

/** The label to show a citizen, falling back to the code when unexpanded. */
export function categoryLabelOf(value: IssueCategoryValue | null | undefined, language: "en" | "hi"): string {
  if (!value) return "";
  if (!isCategoryRef(value)) return String(value);
  return (language === "en" ? value.nameEn : value.nameHi) ?? value.code;
}
