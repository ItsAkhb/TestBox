// Display label for a tag record. Shared by Exam + Tags so the picker
// and chips stay consistent (including the migrated __marked__ tag).
export function tagLabel(tag, t) {
  if (tag?.name === "__marked__") return t("tags.marked");
  return tag?.name || "";
}
