import branchService from "../../../services/branches";
import BoardApi from "./api";

export interface DragContext {
    draggedNote: any;
    draggedBranch: any;
    draggedNoteElement: JQuery<HTMLElement> | null;
}

export class BoardDragHandler {
    private $container: JQuery<HTMLElement>;
    private api: BoardApi;
    private context: DragContext;
    private onBoardRefresh: () => Promise<void>;

    constructor(
        $container: JQuery<HTMLElement>,
        api: BoardApi,
        context: DragContext,
        onBoardRefresh: () => Promise<void>
    ) {
        this.$container = $container;
        this.api = api;
        this.context = context;
        this.onBoardRefresh = onBoardRefresh;
    }

    setupNoteDrag($noteEl: JQuery<HTMLElement>, note: any, branch: any) {
        $noteEl.attr("draggable", "true");

        // Mouse drag events
        this.setupMouseDrag($noteEl, note, branch);

        // Touch drag events
        this.setupTouchDrag($noteEl, note, branch);
    }

    updateApi(newApi: BoardApi) {
        this.api = newApi;
    }

    private cleanupAllDropIndicators() {
        // Remove all drop indicators from the DOM to prevent layout issues
        this.$container.find(".board-drop-indicator").remove();
    }

    private cleanupColumnDropIndicators($columnEl: JQuery<HTMLElement>) {
        // Remove drop indicators from a specific column
        $columnEl.find(".board-drop-indicator").remove();
    }

    // Public method to clean up any stray indicators - can be called externally
    cleanup() {
        this.cleanupAllDropIndicators();
        this.$container.find('.board-column').removeClass('drag-over');
    }

    private setupMouseDrag($noteEl: JQuery<HTMLElement>, note: any, branch: any) {
        $noteEl.on("dragstart", (e) => {
            this.context.draggedNote = note;
            this.context.draggedBranch = branch;
            this.context.draggedNoteElement = $noteEl;
            $noteEl.addClass("dragging");

            // Set drag data
            const originalEvent = e.originalEvent as DragEvent;
            if (originalEvent.dataTransfer) {
                originalEvent.dataTransfer.effectAllowed = "move";
                originalEvent.dataTransfer.setData("text/plain", note.noteId);
            }
        });

        $noteEl.on("dragend", () => {
            $noteEl.removeClass("dragging");
            this.context.draggedNote = null;
            this.context.draggedBranch = null;
            this.context.draggedNoteElement = null;

            // Clean up all drop indicators properly
            this.cleanupAllDropIndicators();
        });
    }

    private setupTouchDrag($noteEl: JQuery<HTMLElement>, note: any, branch: any) {
        let isDragging = false;
        let startY = 0;
        let startX = 0;
        let dragThreshold = 10; // Minimum distance to start dragging
        let $dragPreview: JQuery<HTMLElement> | null = null;

        $noteEl.on("touchstart", (e) => {
            const touch = (e.originalEvent as TouchEvent).touches[0];
            startX = touch.clientX;
            startY = touch.clientY;
            isDragging = false;
            $dragPreview = null;
        });

        $noteEl.on("touchmove", (e) => {
            e.preventDefault(); // Prevent scrolling
            const touch = (e.originalEvent as TouchEvent).touches[0];
            const deltaX = Math.abs(touch.clientX - startX);
            const deltaY = Math.abs(touch.clientY - startY);

            // Start dragging if we've moved beyond threshold
            if (!isDragging && (deltaX > dragThreshold || deltaY > dragThreshold)) {
                isDragging = true;
                this.context.draggedNote = note;
                this.context.draggedBranch = branch;
                this.context.draggedNoteElement = $noteEl;
                $noteEl.addClass("dragging");

                // Create drag preview
                $dragPreview = this.createDragPreview($noteEl, touch.clientX, touch.clientY);
            }

            if (isDragging && $dragPreview) {
                // Update drag preview position
                $dragPreview.css({
                    left: touch.clientX - ($dragPreview.outerWidth() || 0) / 2,
                    top: touch.clientY - ($dragPreview.outerHeight() || 0) / 2
                });

                // Find element under touch point
                const elementBelow = document.elementFromPoint(touch.clientX, touch.clientY);
                if (elementBelow) {
                    const $columnEl = $(elementBelow).closest('.board-column');

                    if ($columnEl.length > 0) {
                        // Remove drag-over from all columns
                        this.$container.find('.board-column').removeClass('drag-over');
                        $columnEl.addClass('drag-over');

                        // Show drop indicator
                        this.showDropIndicatorAtPoint($columnEl, touch.clientY);
                    } else {
                        // Remove all drag indicators if not over a column
                        this.$container.find('.board-column').removeClass('drag-over');
                        this.cleanupAllDropIndicators();
                    }
                }
            }
        });

        $noteEl.on("touchend", async (e) => {
            if (isDragging) {
                const touch = (e.originalEvent as TouchEvent).changedTouches[0];
                const elementBelow = document.elementFromPoint(touch.clientX, touch.clientY);
                if (elementBelow) {
                    const $columnEl = $(elementBelow).closest('.board-column');

                    if ($columnEl.length > 0) {
                        const column = $columnEl.attr('data-column');
                        if (column && this.context.draggedNote && this.context.draggedNoteElement && this.context.draggedBranch) {
                            await this.handleNoteDrop($columnEl, column);
                        }
                    }
                }

                // Clean up
                $noteEl.removeClass("dragging");
                this.context.draggedNote = null;
                this.context.draggedBranch = null;
                this.context.draggedNoteElement = null;
                this.$container.find('.board-column').removeClass('drag-over');
                this.cleanupAllDropIndicators();

                // Remove drag preview
                if ($dragPreview) {
                    $dragPreview.remove();
                    $dragPreview = null;
                }
            }
            isDragging = false;
        });
    }

    setupColumnDropZone($columnEl: JQuery<HTMLElement>, column: string) {
        $columnEl.on("dragover", (e) => {
            e.preventDefault();
            const originalEvent = e.originalEvent as DragEvent;
            if (originalEvent.dataTransfer) {
                originalEvent.dataTransfer.dropEffect = "move";
            }

            if (this.context.draggedNote) {
                $columnEl.addClass("drag-over");
                this.showDropIndicator($columnEl, e);
            }
        });

        $columnEl.on("dragleave", (e) => {
            // Only remove drag-over if we're leaving the column entirely
            const rect = $columnEl[0].getBoundingClientRect();
            const originalEvent = e.originalEvent as DragEvent;
            const x = originalEvent.clientX;
            const y = originalEvent.clientY;

            if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
                $columnEl.removeClass("drag-over");
                this.cleanupColumnDropIndicators($columnEl);
            }
        });

        $columnEl.on("drop", async (e) => {
            e.preventDefault();
            $columnEl.removeClass("drag-over");

            if (this.context.draggedNote && this.context.draggedNoteElement && this.context.draggedBranch) {
                await this.handleNoteDrop($columnEl, column);
            }
        });
    }

    private createDragPreview($noteEl: JQuery<HTMLElement>, x: number, y: number): JQuery<HTMLElement> {
        // Clone the note element for the preview
        const $preview = $noteEl.clone();

        $preview
            .addClass('board-drag-preview')
            .css({
                position: 'fixed',
                left: x - ($noteEl.outerWidth() || 0) / 2,
                top: y - ($noteEl.outerHeight() || 0) / 2,
                pointerEvents: 'none',
                zIndex: 10000
            })
            .appendTo('body');

        return $preview;
    }

    private showDropIndicator($columnEl: JQuery<HTMLElement>, e: JQuery.DragOverEvent) {
        const originalEvent = e.originalEvent as DragEvent;
        const mouseY = originalEvent.clientY;
        this.showDropIndicatorAtY($columnEl, mouseY);
    }

    private showDropIndicatorAtPoint($columnEl: JQuery<HTMLElement>, touchY: number) {
        this.showDropIndicatorAtY($columnEl, touchY);
    }

    private showDropIndicatorAtY($columnEl: JQuery<HTMLElement>, y: number) {
        const columnRect = $columnEl[0].getBoundingClientRect();
        const relativeY = y - columnRect.top;

        // Clean up any existing drop indicators in this column first
        this.cleanupColumnDropIndicators($columnEl);

        // Create a new drop indicator
        const $dropIndicator = $("<div>").addClass("board-drop-indicator");

        // Find the best position to insert the note
        const $notes = this.context.draggedNoteElement ?
            $columnEl.find(".board-note").not(this.context.draggedNoteElement) :
            $columnEl.find(".board-note");
        let insertAfterElement: HTMLElement | null = null;

        $notes.each((_, noteEl) => {
            const noteRect = noteEl.getBoundingClientRect();
            const noteMiddle = noteRect.top + noteRect.height / 2 - columnRect.top;

            if (relativeY > noteMiddle) {
                insertAfterElement = noteEl;
            }
        });

        // Position the drop indicator
        if (insertAfterElement) {
            $(insertAfterElement).after($dropIndicator);
        } else {
            // Insert at the beginning (after the header)
            const $header = $columnEl.find("h3");
            $header.after($dropIndicator);
        }

        $dropIndicator.addClass("show");
    }

    private async handleNoteDrop($columnEl: JQuery<HTMLElement>, column: string) {
        const draggedNoteElement = this.context.draggedNoteElement;
        const draggedNote = this.context.draggedNote;
        const draggedBranch = this.context.draggedBranch;

        if (draggedNote && draggedNoteElement && draggedBranch) {
            const currentColumn = draggedNoteElement.attr("data-current-column");

            // Capture drop indicator position BEFORE removing it
            const dropIndicator = $columnEl.find(".board-drop-indicator.show");
            let targetBranchId: string | null = null;
            let moveType: "before" | "after" | null = null;

            if (dropIndicator.length > 0) {
                // Find the note element that the drop indicator is positioned relative to
                const nextNote = dropIndicator.next(".board-note");
                const prevNote = dropIndicator.prev(".board-note");

                if (nextNote.length > 0) {
                    targetBranchId = nextNote.attr("data-branch-id") || null;
                    moveType = "before";
                } else if (prevNote.length > 0) {
                    targetBranchId = prevNote.attr("data-branch-id") || null;
                    moveType = "after";
                }
            }

            try {
                // Handle column change
                if (currentColumn !== column) {
                    await this.api.changeColumn(draggedNote.noteId, column);
                }

                // Handle position change (works for both same column and different column moves)
                if (targetBranchId && moveType) {
                    if (moveType === "before") {
                        console.log("Move before branch:", draggedBranch.branchId, "to", targetBranchId);
                        await branchService.moveBeforeBranch([draggedBranch.branchId], targetBranchId);
                    } else if (moveType === "after") {
                        console.log("Move after branch:", draggedBranch.branchId, "to", targetBranchId);
                        await branchService.moveAfterBranch([draggedBranch.branchId], targetBranchId);
                    }
                }

                // Update the data attributes
                draggedNoteElement.attr("data-current-column", column);

                // Show success feedback
                console.log(`Moved note "${draggedNote.title}" from "${currentColumn}" to "${column}"`);

                // Refresh the board to reflect the changes
                await this.onBoardRefresh();
            } catch (error) {
                console.error("Failed to update note position:", error);
            } finally {
                // Always clean up drop indicators after drop operation
                this.cleanupAllDropIndicators();
            }
        }
    }
}
