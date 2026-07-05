from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('accounts_app', '0004_certificaterecord'),
    ]

    operations = [
        migrations.AlterModelOptions(
            name='userprofile',
            options={
                'permissions': [
                    ('can_delegate_permissions', 'Can delegate own permissions to team members'),
                ]
            },
        ),
    ]
