!macro customUnInstall
  MessageBox MB_ICONEXCLAMATION|MB_YESNO "SoleNexa will now be uninstalled. Factory records are stored separately and will NOT be deleted by this uninstall. Keep the database and backups if you may reinstall or need your records. Continue?" IDYES +2
  Abort
!macroend