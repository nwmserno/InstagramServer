import 'package:flutter/material.dart';
import 'NotificationService.dart';

class NotificationSetting extends StatefulWidget {
  final String type; // 'privacy' หรือ 'stories'
  final String title;
  final List<String> usernames;
  final String email;

  const NotificationSetting({
    super.key,
    required this.type,
    required this.title,
    required this.usernames,
    required this.email,
  });

  @override
  State<NotificationSetting> createState() => _NotificationSettingState();
}

class _NotificationSettingState extends State<NotificationSetting> {
  final NotificationService _notificationService = NotificationService();
  NotificationFrequency _selectedFrequency = NotificationFrequency.daily;
  CheckFrequency _selectedCheckFrequency = CheckFrequency.every12Hours;
  bool _isActive = false;
  bool _isLoading = false;

  @override
  void initState() {
    super.initState();
    _loadCurrentSettings();
  }

  Future<void> _loadCurrentSettings() async {
    setState(() {
      _isLoading = true;
    });

    try {
      final settings =
          await _notificationService.loadNotificationSettings(widget.type);
      if (settings != null) {
        setState(() {
          _selectedFrequency = settings['frequency'];
          _selectedCheckFrequency =
              CheckFrequency.values[settings['checkFrequency'] ?? 4];
          _isActive = settings['isActive'] ?? false;
        });
      }
    } catch (e) {
      print('Error loading settings: $e');
    } finally {
      setState(() {
        _isLoading = false;
      });
    }
  }

  Future<void> _saveSettings() async {
    if (widget.email.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('กรุณากรอกอีเมลก่อนเปิดใช้งานการแจ้งเตือน'),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }

    if (widget.usernames.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('กรุณาเลือก username อย่างน้อย 1 รายการ'),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }

    setState(() {
      _isLoading = true;
    });

    try {
      await _notificationService.saveNotificationSettings(
        type: widget.type,
        usernames: widget.usernames,
        email: widget.email,
        frequency: _selectedFrequency,
        isActive: _isActive,
        checkFrequency: _selectedCheckFrequency,
      );

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(_isActive
                ? 'เปิดใช้งานการแจ้งเตือนเรียบร้อยแล้ว'
                : 'ปิดใช้งานการแจ้งเตือนเรียบร้อยแล้ว'),
            backgroundColor: Colors.green,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('เกิดข้อผิดพลาด: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      setState(() {
        _isLoading = false;
      });
    }
  }

  String _getFrequencyText(NotificationFrequency frequency) {
    switch (frequency) {
      case NotificationFrequency.daily:
        return 'ทุกวัน';
      case NotificationFrequency.weekly:
        return 'ทุกสัปดาห์';
      case NotificationFrequency.monthly:
        return 'ทุก 1 เดือน';
      case NotificationFrequency.quarterly:
        return 'ทุก 3 เดือน';
      case NotificationFrequency.semiAnnually:
        return 'ทุก 6 เดือน';
      case NotificationFrequency.nineMonths:
        return 'ทุก 9 เดือน';
      case NotificationFrequency.yearly:
        return 'ทุกปี';
    }
  }

  String _getFrequencyDescription(NotificationFrequency frequency) {
    switch (frequency) {
      case NotificationFrequency.daily:
        return 'ส่งการแจ้งเตือนทุก 24 ชั่วโมง';
      case NotificationFrequency.weekly:
        return 'ส่งการแจ้งเตือนทุก 7 วัน';
      case NotificationFrequency.monthly:
        return 'ส่งการแจ้งเตือนทุก 30 วัน';
      case NotificationFrequency.quarterly:
        return 'ส่งการแจ้งเตือนทุก 90 วัน';
      case NotificationFrequency.semiAnnually:
        return 'ส่งการแจ้งเตือนทุก 180 วัน';
      case NotificationFrequency.nineMonths:
        return 'ส่งการแจ้งเตือนทุก 270 วัน';
      case NotificationFrequency.yearly:
        return 'ส่งการแจ้งเตือนทุก 365 วัน';
    }
  }

  String _getCheckFrequencyText(CheckFrequency frequency) {
    switch (frequency) {
      case CheckFrequency.every5Minutes:
        return 'ทุก 5 นาที';
      case CheckFrequency.every30Minutes:
        return 'ทุก 30 นาที';
      case CheckFrequency.everyHour:
        return 'ทุก 1 ชั่วโมง';
      case CheckFrequency.every3Hours:
        return 'ทุก 3 ชั่วโมง';
      case CheckFrequency.every6Hours:
        return 'ทุก 6 ชั่วโมง';
      case CheckFrequency.every8Hours:
        return 'ทุก 8 ชั่วโมง';
      case CheckFrequency.every12Hours:
        return 'ทุก 12 ชั่วโมง';
      case CheckFrequency.everyDay:
        return 'ทุก 1 วัน';
    }
  }

  String _getCheckFrequencyDescription(CheckFrequency frequency) {
    switch (frequency) {
      case CheckFrequency.every5Minutes:
        return 'ตรวจสอบการเปลี่ยนแปลงทุก 5 นาที (ใช้ทรัพยากรมาก)';
      case CheckFrequency.every30Minutes:
        return 'ตรวจสอบการเปลี่ยนแปลงทุก 30 นาที (ใช้ทรัพยากรปานกลาง)';
      case CheckFrequency.everyHour:
        return 'ตรวจสอบการเปลี่ยนแปลงทุก 1 ชั่วโมง (สมดุล)';
      case CheckFrequency.every3Hours:
        return 'ตรวจสอบการเปลี่ยนแปลงทุก 3 ชั่วโมง (ประหยัดปานกลาง)';
      case CheckFrequency.every6Hours:
        return 'ตรวจสอบการเปลี่ยนแปลงทุก 6 ชั่วโมง (ประหยัด)';
      case CheckFrequency.every8Hours:
        return 'ตรวจสอบการเปลี่ยนแปลงทุก 8 ชั่วโมง (ประหยัดมาก)';
      case CheckFrequency.every12Hours:
        return 'ตรวจสอบการเปลี่ยนแปลงทุก 12 ชั่วโมง (ประหยัดมาก)';
      case CheckFrequency.everyDay:
        return 'ตรวจสอบการเปลี่ยนแปลงทุก 1 วัน (ประหยัดที่สุด)';
    }
  }

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 4,
      margin: const EdgeInsets.all(16),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(
                  widget.type == 'privacy'
                      ? Icons.privacy_tip
                      : Icons.auto_stories,
                  color: Colors.deepPurple,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    widget.title,
                    style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
                Switch(
                  value: _isActive,
                  onChanged: (value) {
                    setState(() {
                      _isActive = value;
                    });
                    if (value) {
                      _saveSettings();
                    } else {
                      _saveSettings();
                    }
                  },
                  activeColor: Colors.deepPurple,
                ),
              ],
            ),

            const SizedBox(height: 16),

            // แสดงรายการ Usernames
            if (widget.usernames.isNotEmpty) ...[
              const Text(
                'รายการ Usernames ที่จะติดตาม:',
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 4,
                children: widget.usernames.map((username) {
                  return Chip(
                    label: Text('@$username'),
                    backgroundColor: Colors.deepPurple.shade50,
                    side: BorderSide(color: Colors.deepPurple.shade200),
                  );
                }).toList(),
              ),
              const SizedBox(height: 16),
            ],

            // แสดงอีเมล
            if (widget.email.isNotEmpty) ...[
              const Text(
                'อีเมลสำหรับรับการแจ้งเตือน:',
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 8),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                decoration: BoxDecoration(
                  color: Colors.grey.shade100,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.grey.shade300),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.email, size: 16, color: Colors.grey),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        widget.email,
                        style: const TextStyle(fontSize: 14),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
            ],

            // เลือกความถี่การแจ้งเตือน
            const Text(
              'ความถี่การแจ้งเตือน:',
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 8),

            ...NotificationFrequency.values.map((frequency) {
              return RadioListTile<NotificationFrequency>(
                title: Text(_getFrequencyText(frequency)),
                subtitle: Text(
                  _getFrequencyDescription(frequency),
                  style: TextStyle(
                    fontSize: 12,
                    color: Colors.grey.shade600,
                  ),
                ),
                value: frequency,
                groupValue: _selectedFrequency,
                onChanged: _isLoading
                    ? null
                    : (value) {
                        setState(() {
                          _selectedFrequency = value!;
                        });
                        _saveSettings();
                      },
                activeColor: Colors.deepPurple,
                contentPadding: EdgeInsets.zero,
              );
            }).toList(),

            const SizedBox(height: 16),

            // เลือกความถี่การตรวจสอบ
            const Text(
              'ความถี่การตรวจสอบ:',
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 8),

            ...CheckFrequency.values.map((frequency) {
              return RadioListTile<CheckFrequency>(
                title: Text(_getCheckFrequencyText(frequency)),
                subtitle: Text(
                  _getCheckFrequencyDescription(frequency),
                  style: TextStyle(
                    fontSize: 12,
                    color: Colors.grey.shade600,
                  ),
                ),
                value: frequency,
                groupValue: _selectedCheckFrequency,
                onChanged: _isLoading
                    ? null
                    : (value) {
                        setState(() {
                          _selectedCheckFrequency = value!;
                        });
                        _saveSettings();
                      },
                activeColor: Colors.orange,
                contentPadding: EdgeInsets.zero,
              );
            }).toList(),

            const SizedBox(height: 16),

            // สถานะการทำงาน
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: _isActive ? Colors.green.shade50 : Colors.grey.shade50,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(
                  color:
                      _isActive ? Colors.green.shade200 : Colors.grey.shade300,
                ),
              ),
              child: Row(
                children: [
                  Icon(
                    _isActive ? Icons.check_circle : Icons.info,
                    color: _isActive ? Colors.green : Colors.grey,
                    size: 20,
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      _isActive
                          ? 'การแจ้งเตือนกำลังทำงาน - จะส่งอีเมลแยกตามแต่ละ username'
                          : 'การแจ้งเตือนปิดอยู่',
                      style: TextStyle(
                        fontSize: 12,
                        color: _isActive
                            ? Colors.green.shade800
                            : Colors.grey.shade600,
                      ),
                    ),
                  ),
                ],
              ),
            ),

            if (_isLoading) ...[
              const SizedBox(height: 16),
              const Center(
                child: CircularProgressIndicator(),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
