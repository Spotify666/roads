/** The pilot spot: its Lab is built in and opens at /pilot. Kept here, free of sim data, so any page can link to the Lab. */
export const PILOT_ID = "mehdipatnam";

/** The Lab page for a spot: the pilot at /pilot, every other spot at /pilot/<id>. */
export const labHref = (id: string) => (id === PILOT_ID ? "/pilot" : `/pilot/${id}`);
