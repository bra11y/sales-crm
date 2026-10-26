-- Himalayas asks you to sign up, upload your CV, then pay before you can apply.
-- Its jobs you have not acted on are hidden; ones you saved or applied to stay.
update public.job_posts
set hidden_reason = 'From himalayas.app, a site you skip'
where source = 'himalayas' and status = 'new' and hidden_reason is null;
