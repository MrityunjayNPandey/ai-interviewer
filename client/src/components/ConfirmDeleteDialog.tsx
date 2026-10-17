import { Alert, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle } from "@mui/material";

type Props = {
  open: boolean;
  pending: boolean;
  error: Error | null;
  onCancel: () => void;
  onConfirm: () => void;
};

export default function ConfirmDeleteDialog({ open, pending, error, onCancel, onConfirm }: Props) {
  return (
    <Dialog open={open} onClose={onCancel}>
      <DialogTitle>Delete this interview?</DialogTitle>
      <DialogContent>
        <DialogContentText>
          Its transcript, report, and the resume text you used will be permanently deleted. This can't be undone.
        </DialogContentText>
        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error.message}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>Cancel</Button>
        <Button color="error" variant="contained" disabled={pending} onClick={onConfirm}>
          Delete
        </Button>
      </DialogActions>
    </Dialog>
  );
}
