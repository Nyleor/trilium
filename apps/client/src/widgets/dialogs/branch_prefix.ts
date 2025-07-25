import treeService from "../../services/tree.js";
import server from "../../services/server.js";
import froca from "../../services/froca.js";
import toastService from "../../services/toast.js";
import BasicWidget from "../basic_widget.js";
import appContext from "../../components/app_context.js";
import { t } from "../../services/i18n.js";
import { Modal } from "bootstrap";
import { openDialog } from "../../services/dialog.js";

const TPL = /*html*/`<div class="branch-prefix-dialog modal fade mx-auto" tabindex="-1" role="dialog">
    <div class="modal-dialog modal-lg" role="document">
        <form class="branch-prefix-form">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title flex-grow-1">${t("branch_prefix.edit_branch_prefix")}</h5>
                    <button class="help-button" type="button" data-help-page="tree-concepts.html#prefix" title="${t("branch_prefix.help_on_tree_prefix")}">?</button>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="${t("branch_prefix.close")}"></button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label for="branch-prefix-input">${t("branch_prefix.prefix")}</label> &nbsp;

                        <div class="input-group">
                            <input class="branch-prefix-input form-control">
                            <div class="branch-prefix-note-title input-group-text"></div>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-primary btn-sm">${t("branch_prefix.save")}</button>
                </div>
            </div>
        </form>
    </div>
</div>`;

export default class BranchPrefixDialog extends BasicWidget {
    private modal!: Modal;
    private $form!: JQuery<HTMLElement>;
    private $treePrefixInput!: JQuery<HTMLElement>;
    private $noteTitle!: JQuery<HTMLElement>;
    private branchId: string | null = null;

    doRender() {
        this.$widget = $(TPL);
        this.modal = Modal.getOrCreateInstance(this.$widget[0]);
        this.$form = this.$widget.find(".branch-prefix-form");
        this.$treePrefixInput = this.$widget.find(".branch-prefix-input");
        this.$noteTitle = this.$widget.find(".branch-prefix-note-title");

        this.$form.on("submit", () => {
            this.savePrefix();
            return false;
        });

        this.$widget.on("shown.bs.modal", () => this.$treePrefixInput.trigger("focus"));
    }

    async refresh(notePath: string) {
        const { noteId, parentNoteId } = treeService.getNoteIdAndParentIdFromUrl(notePath);

        if (!noteId || !parentNoteId) {
            return;
        }

        const newBranchId = await froca.getBranchId(parentNoteId, noteId);
        if (!newBranchId) {
            return;
        }
        this.branchId = newBranchId;

        const branch = froca.getBranch(this.branchId);
        if (!branch || branch.noteId === "root") {
            return;
        }

        const parentNote = await froca.getNote(branch.parentNoteId);
        if (!parentNote || parentNote.type === "search") {
            return;
        }

        this.$treePrefixInput.val(branch.prefix || "");

        const noteTitle = await treeService.getNoteTitle(noteId);
        this.$noteTitle.text(` - ${noteTitle}`);
    }

    async editBranchPrefixEvent() {
        const notePath = appContext.tabManager.getActiveContextNotePath();
        if (!notePath) {
            return;
        }

        await this.refresh(notePath);
        openDialog(this.$widget);
    }

    async savePrefix() {
        const prefix = this.$treePrefixInput.val();

        await server.put(`branches/${this.branchId}/set-prefix`, { prefix: prefix });

        this.modal.hide();

        toastService.showMessage(t("branch_prefix.branch_prefix_saved"));
    }
}
