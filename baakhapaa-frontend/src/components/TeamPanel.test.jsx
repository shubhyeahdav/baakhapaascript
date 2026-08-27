import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

/**
 * Per-project team management (proposal FR12).
 *
 * Roles are per project, not global, because a person is usually a writer on
 * their own work and a reader on someone else's — one global role cannot express
 * that. So the panel picks a project first and manages membership within it,
 * and every control it offers depends on the caller's role *on that project*.
 *
 * The behaviour worth guarding is what a non-admin sees: no role selector, no
 * Remove button, no add form. None of that is security — the server enforces the
 * same rules and would refuse — but a UI that offers a control the server will
 * reject is a UI that teaches people the product is broken.
 *
 * The owner is a second case of the same thing. They are an admin implicitly,
 * with no membership row, so their role is not editable even by another admin;
 * demoting the owner through this panel would be writing a row that does not
 * exist.
 */

vi.mock("../services/api", () => ({
  projects: {
    getAll: vi.fn(), members: vi.fn(),
    addMember: vi.fn(), setMemberRole: vi.fn(), removeMember: vi.fn(),
    invites: vi.fn(), revokeInvite: vi.fn(),
  },
}));

// eslint-disable-next-line import/first
import TeamPanel from "./TeamPanel";
// eslint-disable-next-line import/first
import { projects as projectsApi } from "../services/api";

const OWNER = { user_id: "u-owner", name: "Mira", email: "mira@example.com", role: "admin", owner: true };
const EDITOR = { user_id: "u-ed", name: "Suman", email: "suman@example.com", role: "editor" };

const asRole = (your_role, members = [OWNER, EDITOR]) => {
  projectsApi.members.mockResolvedValue({ data: { members, your_role } });
};

beforeEach(() => {
  projectsApi.getAll.mockResolvedValue({
    data: [{ id: "p1", title: "Sapana" }, { id: "p2", title: "Bahini", owner: false, your_role: "viewer" }],
  });
  asRole("admin");
  projectsApi.addMember.mockResolvedValue({});
  projectsApi.setMemberRole.mockResolvedValue({});
  projectsApi.removeMember.mockResolvedValue({});
  projectsApi.invites.mockResolvedValue({ data: { invites: [] } });
  projectsApi.revokeInvite.mockResolvedValue({});
});

describe("picking a project", () => {
  it("selects the first one so the panel is never empty on arrival", async () => {
    render(<TeamPanel />);

    await waitFor(() => expect(projectsApi.members).toHaveBeenCalledWith("p1"));
  });

  it("marks a project that belongs to somebody else", async () => {
    render(<TeamPanel />);

    expect(await screen.findByText(/Bahini — shared with you \(viewer\)/))
      .toBeInTheDocument();
  });

  it("says so when there are no projects at all", async () => {
    projectsApi.getAll.mockResolvedValue({ data: [] });
    render(<TeamPanel />);

    expect(await screen.findByText("No projects yet")).toBeInTheDocument();
  });

  it("loads the members of a newly chosen project", async () => {
    render(<TeamPanel />);
    await waitFor(() => expect(projectsApi.members).toHaveBeenCalledWith("p1"));

    fireEvent.change(screen.getByLabelText("Project"), { target: { value: "p2" } });

    await waitFor(() => expect(projectsApi.members).toHaveBeenCalledWith("p2"));
  });

  it("survives a projects list that will not load", async () => {
    projectsApi.getAll.mockRejectedValue(new Error("offline"));
    render(<TeamPanel />);

    expect(await screen.findByText("No projects yet")).toBeInTheDocument();
  });
});

describe("as an admin", () => {
  it("lists everyone with their address", async () => {
    render(<TeamPanel />);

    expect(await screen.findByText("suman@example.com")).toBeInTheDocument();
    expect(screen.getByText(/Mira/)).toBeInTheDocument();
  });

  it("marks the owner", async () => {
    render(<TeamPanel />);

    expect(await screen.findByText("(owner)")).toBeInTheDocument();
  });

  it("does not offer to change the owner's role", async () => {
    // The owner is an admin implicitly, with no membership row to edit.
    render(<TeamPanel />);
    await screen.findByText("suman@example.com");

    expect(screen.queryByLabelText("Role for mira@example.com")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Remove mira@example.com")).not.toBeInTheDocument();
  });

  it("changes a member's role", async () => {
    render(<TeamPanel />);
    await screen.findByText("suman@example.com");

    fireEvent.change(screen.getByLabelText("Role for suman@example.com"),
                     { target: { value: "viewer" } });

    await waitFor(() =>
      expect(projectsApi.setMemberRole).toHaveBeenCalledWith("p1", "u-ed", "viewer"));
  });

  it("removes a member", async () => {
    render(<TeamPanel />);
    await screen.findByText("suman@example.com");

    fireEvent.click(screen.getByLabelText("Remove suman@example.com"));

    await waitFor(() =>
      expect(projectsApi.removeMember).toHaveBeenCalledWith("p1", "u-ed"));
  });

  it("reloads the list after a change, rather than guessing at the new state", async () => {
    render(<TeamPanel />);
    await screen.findByText("suman@example.com");

    fireEvent.click(screen.getByLabelText("Remove suman@example.com"));

    await waitFor(() => expect(projectsApi.members).toHaveBeenCalledTimes(2));
  });
});

describe("adding someone", () => {
  const fill = (email) =>
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: email } });

  it("is honest that it cannot deliver the invitation itself", async () => {
    // The limitation moved rather than disappearing. Anyone can be invited now;
    // what the product still cannot do is send the message — and implying it
    // had would leave the other person waiting for mail that never arrives.
    render(<TeamPanel />);

    expect(await screen.findByText(/we don't email it for you/i)).toBeInTheDocument();
  });

  it("explains what the chosen role can do", async () => {
    render(<TeamPanel />);
    await screen.findByText("suman@example.com");

    expect(screen.getByText(/Write the script, add scenes/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Role"), { target: { value: "viewer" } });

    expect(screen.getByText(/Cannot change anything/)).toBeInTheDocument();
  });

  it("adds them at the chosen role", async () => {
    render(<TeamPanel />);
    await screen.findByText("suman@example.com");
    fill("new@example.com");
    fireEvent.change(screen.getByLabelText("Role"), { target: { value: "viewer" } });

    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() =>
      expect(projectsApi.addMember).toHaveBeenCalledWith("p1", "new@example.com", "viewer"));
  });

  it("trims the address", async () => {
    render(<TeamPanel />);
    await screen.findByText("suman@example.com");
    fill("  new@example.com  ");

    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() =>
      expect(projectsApi.addMember).toHaveBeenCalledWith("p1", "new@example.com", "editor"));
  });

  it("confirms in words the writer can check", async () => {
    render(<TeamPanel />);
    await screen.findByText("suman@example.com");
    fill("new@example.com");

    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(await screen.findByText("new@example.com can now work on this project."))
      .toBeInTheDocument();
  });

  it("says read rather than work on for a viewer", async () => {
    render(<TeamPanel />);
    await screen.findByText("suman@example.com");
    fill("new@example.com");
    fireEvent.change(screen.getByLabelText("Role"), { target: { value: "viewer" } });

    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(await screen.findByText("new@example.com can now read this project."))
      .toBeInTheDocument();
  });

  it("reports the server's refusal", async () => {
    projectsApi.addMember.mockRejectedValue({
      response: { data: { detail: "No account with that email." } },
    });
    render(<TeamPanel />);
    await screen.findByText("suman@example.com");
    fill("nobody@example.com");

    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(await screen.findByText("No account with that email.")).toBeInTheDocument();
  });

  it("flattens a validation error list into something readable", async () => {
    // FastAPI returns a list of objects for a validation failure; printing it
    // raw would show "[object Object]" to the writer.
    projectsApi.addMember.mockRejectedValue({
      response: { data: { detail: [{ msg: "value is not a valid email address" }] } },
    });
    render(<TeamPanel />);
    await screen.findByText("suman@example.com");
    fill("new@example.com");

    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(await screen.findByText("value is not a valid email address"))
      .toBeInTheDocument();
  });

  it("has a message of its own when the error has no shape it knows", async () => {
    projectsApi.addMember.mockRejectedValue(new Error("network"));
    render(<TeamPanel />);
    await screen.findByText("suman@example.com");
    fill("new@example.com");

    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(await screen.findByText("That didn't work.")).toBeInTheDocument();
  });
});

describe("as an editor rather than an admin", () => {
  beforeEach(() => asRole("editor"));

  it("offers no way to add anyone", async () => {
    render(<TeamPanel />);
    await screen.findByText("suman@example.com");

    expect(screen.queryByRole("button", { name: "Add" })).not.toBeInTheDocument();
  });

  it("offers no role selector or Remove on anybody", async () => {
    render(<TeamPanel />);
    await screen.findByText("suman@example.com");

    expect(screen.queryByLabelText("Role for suman@example.com")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Remove suman@example.com")).not.toBeInTheDocument();
  });

  it("still shows what everyone's role is, as text rather than a control", async () => {
    render(<TeamPanel />);
    const row = (await screen.findByText("suman@example.com")).closest("div.flex");

    // "editor" also appears in the footer sentence, so scope to the row.
    expect(row.textContent).toContain("editor");
    expect(row.querySelector("select")).toBeNull();
  });

  it("says whose job the changing is, with the right article", async () => {
    render(<TeamPanel />);

    expect(await screen.findByText(/You're an/)).toBeInTheDocument();
    expect(screen.getByText(/Only an admin can change who has access/))
      .toBeInTheDocument();
  });

  it("uses a rather than an for a viewer", async () => {
    asRole("viewer");
    render(<TeamPanel />);

    expect(await screen.findByText(/You're a\b/)).toBeInTheDocument();
  });
});

it("reports why the team could not be loaded", async () => {
  projectsApi.members.mockRejectedValue({
    response: { data: { detail: "You do not have access to this project." } },
  });
  render(<TeamPanel />);

  expect(await screen.findByText("You do not have access to this project."))
    .toBeInTheDocument();
});

describe("mounted on a project the writer is already in", () => {
  /**
   * Sharing belongs on the work, not in an account screen. The panel used to
   * live only under Settings → Team Members, which asked a writer already
   * inside a script to leave it, find a tab, and re-pick the project they were
   * looking at. Given a `projectId` it manages that one and hides the picker.
   */

  it("does not ask which project", async () => {
    render(<TeamPanel projectId="p1" />);
    await screen.findByText("suman@example.com");

    expect(screen.queryByLabelText("Project")).not.toBeInTheDocument();
  });

  it("does not fetch every project the writer owns", async () => {
    render(<TeamPanel projectId="p1" />);
    await screen.findByText("suman@example.com");

    expect(projectsApi.getAll).not.toHaveBeenCalled();
  });

  it("manages the project it was given", async () => {
    render(<TeamPanel projectId="p2" />);

    await waitFor(() => expect(projectsApi.members).toHaveBeenCalledWith("p2"));
  });

  it("still adds members against that project", async () => {
    render(<TeamPanel projectId="p2" />);
    await screen.findByText("suman@example.com");

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "new@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() =>
      expect(projectsApi.addMember).toHaveBeenCalledWith("p2", "new@example.com", "editor"));
  });

  it("keeps the picker when no project is named", async () => {
    // The Settings mounting: "who can see my work" is also a question people
    // go looking for in an account screen.
    render(<TeamPanel />);

    expect(await screen.findByLabelText("Project")).toBeInTheDocument();
  });
});

describe("inviting someone who has no account yet", () => {
  /**
   * `add_member` used to refuse an unknown address outright, so collaboration
   * could only ever start between two people who had both already found the
   * product. It now creates a pending invitation — but no email is sent, so the
   * link has to be visible and copyable or the invitation goes nowhere.
   *
   * The copy matters as much as the mechanism here: saying somebody "can now"
   * work on a project when they have not signed up would be a plain lie, and
   * implying an email went out would leave them waiting for mail that never
   * arrives.
   */
  const PENDING = {
    data: {
      pending: true,
      invite_id: "inv-1",
      email: "newcomer@example.com",
      role: "editor",
      token: "tok-abc123",
    },
  };

  const invite = async (address = "newcomer@example.com") => {
    render(<TeamPanel projectId="p1" />);
    await screen.findByText("suman@example.com");
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: address } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
  };

  it("hands back a link when the address has no account", async () => {
    projectsApi.addMember.mockResolvedValue(PENDING);
    await invite();

    expect(await screen.findByLabelText("Invitation link"))
      .toHaveValue("http://localhost:3000/invite/tok-abc123");
  });

  it("says plainly that it will not send the message", async () => {
    projectsApi.addMember.mockResolvedValue(PENDING);
    await invite();

    expect(await screen.findByText(/we do not email it for you/i)).toBeInTheDocument();
  });

  it("does not claim they can already work on it", async () => {
    projectsApi.addMember.mockResolvedValue(PENDING);
    await invite();

    expect(await screen.findByText(/will be able to work on this project once they sign up/))
      .toBeInTheDocument();
  });

  it("says read rather than work on for a pending viewer", async () => {
    projectsApi.addMember.mockResolvedValue({ data: { ...PENDING.data, role: "viewer" } });
    render(<TeamPanel projectId="p1" />);
    await screen.findByText("suman@example.com");
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "r@example.com" } });
    fireEvent.change(screen.getByLabelText("Role"), { target: { value: "viewer" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(await screen.findByText(/will be able to read this project once they sign up/))
      .toBeInTheDocument();
  });

  it("explains that the link alone grants nothing", async () => {
    // The security property, stated where the person holding the link can read
    // it: membership comes from signing up with that address, not from the URL.
    projectsApi.addMember.mockResolvedValue(PENDING);
    await invite();

    expect(await screen.findByText(/grants nothing on its own/i)).toBeInTheDocument();
  });

  it("shows no link when the person already had an account", async () => {
    projectsApi.addMember.mockResolvedValue({ data: { user_id: "u9", email: "x@y.z" } });
    await invite("x@y.z");

    await waitFor(() => expect(projectsApi.addMember).toHaveBeenCalled());
    expect(screen.queryByLabelText("Invitation link")).not.toBeInTheDocument();
  });

  it("posts no success notice when the invitation was refused", async () => {
    // `act` swallows the error to display it, so a caller setting its own
    // notice afterwards would announce a success over the failure.
    projectsApi.addMember.mockRejectedValue({
      response: { data: { detail: "This project is at its limit of 2 collaborators." } },
    });
    await invite();

    expect(await screen.findByText(/at its limit of 2 collaborators/)).toBeInTheDocument();
    expect(screen.queryByText(/will be able to/)).not.toBeInTheDocument();
  });

  it("lists who has been invited and not yet arrived", async () => {
    // They occupy a seat from the moment they are invited, so a cap the team
    // cannot see would look like a bug the first time it refused someone.
    projectsApi.invites.mockResolvedValue({
      data: { invites: [{ id: "inv-1", email: "waiting@example.com", role: "viewer", token: "t1" }] },
    });
    render(<TeamPanel projectId="p1" />);

    expect(await screen.findByText("waiting@example.com")).toBeInTheDocument();
    expect(screen.getByText(/Joins as viewer when they sign up/)).toBeInTheDocument();
  });

  it("can retrieve the link for someone invited earlier", async () => {
    projectsApi.invites.mockResolvedValue({
      data: { invites: [{ id: "inv-1", email: "waiting@example.com", role: "viewer", token: "t1" }] },
    });
    render(<TeamPanel projectId="p1" />);
    await screen.findByText("waiting@example.com");

    fireEvent.click(screen.getByRole("button", { name: "Link" }));

    expect(screen.getByLabelText("Invitation link"))
      .toHaveValue("http://localhost:3000/invite/t1");
  });

  it("can take an invitation back", async () => {
    projectsApi.invites.mockResolvedValue({
      data: { invites: [{ id: "inv-1", email: "regret@example.com", role: "editor", token: "t1" }] },
    });
    render(<TeamPanel projectId="p1" />);
    await screen.findByText("regret@example.com");

    fireEvent.click(screen.getByLabelText("Cancel the invitation to regret@example.com"));

    await waitFor(() =>
      expect(projectsApi.revokeInvite).toHaveBeenCalledWith("p1", "inv-1"));
  });

  it("offers a non-admin no way to cancel one", async () => {
    asRole("editor");
    projectsApi.invites.mockResolvedValue({
      data: { invites: [{ id: "inv-1", email: "waiting@example.com", role: "viewer", token: "t1" }] },
    });
    render(<TeamPanel projectId="p1" />);
    await screen.findByText("waiting@example.com");

    expect(screen.queryByLabelText("Cancel the invitation to waiting@example.com"))
      .not.toBeInTheDocument();
  });

  it("carries on when a deployment does not serve the invites endpoint", async () => {
    // Pending invitations are additional information, never load-bearing.
    projectsApi.invites.mockRejectedValue(new Error("404"));
    render(<TeamPanel projectId="p1" />);

    expect(await screen.findByText("suman@example.com")).toBeInTheDocument();
  });
});
